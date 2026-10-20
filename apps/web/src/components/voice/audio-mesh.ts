import type {
  VoiceMember,
  VoiceRoomSnapshot,
  VoiceSignal,
  VoiceIceServer,
} from '@/lib/voice/contracts';

type Peer = {
  pc: RTCPeerConnection;
  transceiver: RTCRtpTransceiver | null;
  epoch: number;
  makingOffer: boolean;
  needsNegotiation: boolean;
  pending: RTCIceCandidateInit[];
  outgoingIce: RTCIceCandidateInit[];
  descriptionSent: boolean;
};
type Options = {
  send: (targetMemberId: string, kind: VoiceSignal['kind'], payload: string) => Promise<void>;
  remote: (memberId: string, stream: MediaStream | null) => void;
  speaking: (memberId: string, active: boolean) => void;
  error: (message: string) => void;
};

/** Audio stays peer-to-peer; this class owns every capture, peer and activity timer. */
export class VoiceAudioMesh {
  private peers = new Map<string, Peer>();
  private room: VoiceRoomSnapshot | null = null;
  private stream: MediaStream | null = null;
  private disposed = false;
  private signalIds = new Set<string>();
  private iceServers: VoiceIceServer[] = [];
  private audioContext: AudioContext | null = null;
  private meters = new Map<
    string,
    { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }
  >();
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing: Promise<void> = Promise.resolve();
  private outgoing: Promise<void> = Promise.resolve();

  constructor(private readonly options: Options) {}

  private get self() {
    return this.room?.members.find((member) => member.id === this.room?.selfMemberId);
  }
  private canSend(member: VoiceMember | undefined) {
    return Boolean(member && member.seat !== null && !member.muted && !member.mutedByModerator);
  }

  private direction(remote: VoiceMember): RTCRtpTransceiverDirection {
    const sends = this.canSend(this.self);
    const receives = this.canSend(remote);
    return sends ? (receives ? 'sendrecv' : 'sendonly') : receives ? 'recvonly' : 'inactive';
  }

  private initiates(remote: VoiceMember) {
    const local = this.self;
    // A participant can offer a receive-only connection before being seated.
    // Keep this choice stable across seat approval, mute changes and reconnects.
    return Boolean(local && local.id < remote.id);
  }

  async sync(room: VoiceRoomSnapshot, iceServers: VoiceIceServer[]) {
    if (this.disposed) return;
    this.room = room;
    if (typeof RTCPeerConnection === 'undefined') {
      this.options.error('الصوت غير مدعوم في هذا المتصفح؛ يمكنك استخدام الدردشة.');
      return;
    }
    this.iceServers = iceServers;
    const self = this.self;
    if (!this.canSend(self) || room.status !== 'OPEN') this.stopMicrophone();
    for (const [id, peer] of this.peers) {
      const member = room.members.find((entry) => entry.id === id);
      if (
        !member ||
        member.connectionEpoch !== peer.epoch ||
        room.status !== 'OPEN' ||
        !self ||
        (self.seat === null && member.seat === null)
      ) {
        this.closePeer(id);
      } else {
        peer.pc.setConfiguration({ iceServers });
        for (const track of peer.pc
          .getReceivers()
          .flatMap((receiver) => (receiver.track ? [receiver.track] : [])))
          track.enabled = this.canSend(member);
        const direction = this.direction(member);
        if (peer.transceiver && peer.transceiver.direction !== direction) {
          peer.transceiver.direction = direction;
          peer.needsNegotiation = true;
          if (this.initiates(member)) void this.offer(member, peer);
        }
      }
    }
    if (!self || room.status !== 'OPEN') return;
    for (const member of room.members) {
      if (member.id !== self.id && (self.seat !== null || member.seat !== null))
        this.ensurePeer(member);
    }
    // SDP/ICE ordering is serialized even if heartbeats overlap a user command.
    const signals = room.signals.filter((signal) => !this.signalIds.has(signal.id));
    for (const signal of signals) this.signalIds.add(signal.id);
    if (this.signalIds.size > 1024) this.signalIds = new Set([...this.signalIds].slice(-512));
    this.processing = this.processing.then(async () => {
      for (const signal of signals) {
        if (this.disposed) return;
        try {
          await this.receive(signal);
        } catch {
          this.options.error('تعذّر وصل أحد المشاركين صوتيًا. ستُعاد المحاولة.');
          this.closePeer(signal.from);
        }
      }
    });
    await this.processing;
  }

  private ensurePeer(member: VoiceMember) {
    const existing = this.peers.get(member.id);
    if (existing) {
      if (!existing.transceiver && this.initiates(member)) void this.offer(member, existing);
      return existing;
    }
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    // The answerer must adopt the offered m-line. Pre-adding a transceiver here
    // creates a second audio m-line in Chromium on subsequent renegotiation.
    const transceiver = this.initiates(member)
      ? pc.addTransceiver('audio', { direction: this.direction(member) })
      : null;
    const peer: Peer = {
      pc,
      transceiver,
      epoch: member.connectionEpoch,
      makingOffer: false,
      needsNegotiation: false,
      pending: [],
      outgoingIce: [],
      descriptionSent: false,
    };
    this.peers.set(member.id, peer);
    if (transceiver && this.stream && this.canSend(this.self))
      void transceiver.sender
        .replaceTrack(this.stream.getAudioTracks()[0] ?? null)
        .catch(() => undefined);
    pc.onicecandidate = (event) => {
      if (event.candidate && !this.disposed && this.peers.get(member.id) === peer) {
        const candidate = event.candidate.toJSON();
        if (!peer.descriptionSent) {
          if (peer.outgoingIce.length < 64) peer.outgoingIce.push(candidate);
        } else
          void this.transmit(member.id, 'ice', JSON.stringify(candidate)).catch(() =>
            this.options.error('تعذّر إرسال بيانات الاتصال الصوتي.'),
          );
      }
    };
    pc.onnegotiationneeded = () => {
      const remote = this.room?.members.find((entry) => entry.id === member.id);
      if (remote && this.initiates(remote)) {
        peer.needsNegotiation = true;
        void this.offer(remote, peer);
      }
    };
    pc.ontrack = (event) => {
      const remote = this.room?.members.find((entry) => entry.id === member.id);
      event.track.enabled = this.canSend(remote);
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.options.remote(member.id, stream);
      this.monitor(member.id, stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.options.error('الاتصال الصوتي ضعيف لدى أحد المشاركين. جارٍ إعادة الوصل.');
        this.closePeer(member.id);
      }
    };
    return peer;
  }

  private transmit(target: string, kind: VoiceSignal['kind'], payload: string) {
    const sent = this.outgoing.then(() =>
      this.disposed ? undefined : this.options.send(target, kind, payload),
    );
    this.outgoing = sent.catch(() => undefined);
    return sent;
  }

  private async flushIce(member: VoiceMember, peer: Peer) {
    peer.descriptionSent = true;
    for (const candidate of peer.outgoingIce.splice(0))
      await this.transmit(member.id, 'ice', JSON.stringify(candidate));
  }

  private async offer(member: VoiceMember, peer: Peer) {
    if (this.disposed || peer.makingOffer || peer.pc.signalingState !== 'stable') return;
    peer.makingOffer = true;
    peer.needsNegotiation = false;
    try {
      peer.transceiver ??=
        peer.pc.getTransceivers().find((entry) => entry.receiver.track.kind === 'audio') ??
        peer.pc.addTransceiver('audio', { direction: this.direction(member) });
      peer.transceiver.direction = this.direction(member);
      if (this.stream && this.canSend(this.self))
        await peer.transceiver.sender.replaceTrack(this.stream.getAudioTracks()[0] ?? null);
      peer.descriptionSent = false;
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      if (!this.disposed && this.peers.get(member.id) === peer && peer.pc.localDescription) {
        await this.transmit(member.id, 'offer', peer.pc.localDescription.sdp);
        await this.flushIce(member, peer);
      }
    } catch {
      if (!this.disposed) {
        this.options.error('تعذّرت مفاوضة الاتصال الصوتي.');
        if (this.peers.get(member.id) === peer) this.closePeer(member.id);
      }
    } finally {
      peer.makingOffer = false;
      const currentMember = this.room?.members.find((entry) => entry.id === member.id);
      if (
        !this.disposed &&
        this.peers.get(member.id) === peer &&
        peer.needsNegotiation &&
        currentMember &&
        this.initiates(currentMember) &&
        peer.pc.signalingState === 'stable'
      ) {
        queueMicrotask(() => {
          void this.offer(currentMember, peer);
        });
      }
    }
  }

  private async adoptOfferedAudio(peer: Peer, member: VoiceMember, sdp: string) {
    let audioSection = false;
    let mid: string | null = null;
    for (const line of sdp.split(/\r?\n/)) {
      if (line.startsWith('m=')) audioSection = line.startsWith('m=audio ');
      if (audioSection && line.startsWith('a=mid:')) {
        mid = line.slice(6);
        break;
      }
    }
    const audio = peer.pc
      .getTransceivers()
      .filter((entry) => entry.receiver.track.kind === 'audio');
    const selected =
      mid !== null
        ? audio.find((entry) => entry.mid === mid)
        : audio.find((entry) => entry.mid !== null);
    if (!selected) throw new Error('Negotiated audio transceiver missing');
    peer.transceiver = selected;
    selected.direction = this.direction(member);
    await selected.sender.replaceTrack(
      this.canSend(this.self) ? (this.stream?.getAudioTracks()[0] ?? null) : null,
    );
    // Rollback can leave an unassociated local transceiver. It must never own capture.
    for (const orphan of audio) {
      if (orphan !== selected && orphan.mid === null) {
        orphan.direction = 'inactive';
        await orphan.sender.replaceTrack(null);
      }
    }
  }

  private async receive(signal: VoiceSignal) {
    const member = this.room?.members.find((entry) => entry.id === signal.from);
    if (!member || member.id === this.self?.id) return;
    if (this.self?.seat === null && member.seat === null) return;
    const peer = this.ensurePeer(member);
    if (signal.kind === 'ice') {
      const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate);
      else if (peer.pending.length < 64) peer.pending.push(candidate);
      return;
    }
    if (signal.kind === 'offer') {
      // Simultaneous seat changes can cross offers; deterministic polite side rolls back.
      if (peer.pc.signalingState !== 'stable') {
        if ((this.self?.id ?? '') < member.id) return;
        await peer.pc.setLocalDescription({ type: 'rollback' });
      }
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.payload });
      await this.adoptOfferedAudio(peer, member, signal.payload);
      peer.descriptionSent = false;
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      if (peer.pc.localDescription) {
        await this.transmit(member.id, 'answer', peer.pc.localDescription.sdp);
        await this.flushIce(member, peer);
      }
    } else {
      if (peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.payload });
      await this.adoptOfferedAudio(peer, member, signal.payload);
    }
    for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
    if (peer.needsNegotiation && this.initiates(member) && peer.pc.signalingState === 'stable')
      void this.offer(member, peer);
  }

  async resumePlayback() {
    await this.audioContext?.resume();
  }

  get microphoneActive() {
    return Boolean(this.stream?.getAudioTracks().some((track) => track.readyState === 'live'));
  }

  async startMicrophone() {
    if (this.disposed || !this.canSend(this.self)) throw new Error('اطلب مقعدًا صوتيًا أولًا.');
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('الميكروفون يحتاج متصفحًا حديثًا واتصال HTTPS.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (this.disposed || !this.canSend(this.self)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stopMicrophone();
    this.stream = stream;
    this.monitor(this.self!.id, stream);
    await this.audioContext?.resume();
    await Promise.all(
      [...this.peers.values()].map((peer) =>
        peer.transceiver?.sender.replaceTrack(stream.getAudioTracks()[0] ?? null),
      ),
    );
  }

  stopMicrophone() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.room) this.unmonitor(this.room.selfMemberId);
    for (const peer of this.peers.values())
      void peer.transceiver?.sender.replaceTrack(null).catch(() => undefined);
  }

  private monitor(id: string, stream: MediaStream) {
    this.unmonitor(id);
    if (typeof AudioContext === 'undefined') return;
    try {
      this.audioContext ??= new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.meters.set(id, { source, analyser, data: new Uint8Array(analyser.fftSize) });
      this.timer ??= setInterval(() => {
        for (const [memberId, meter] of this.meters) {
          meter.analyser.getByteTimeDomainData(meter.data);
          let sum = 0;
          for (const sample of meter.data) sum += ((sample - 128) / 128) ** 2;
          const member = this.room?.members.find((entry) => entry.id === memberId);
          this.options.speaking(
            memberId,
            this.canSend(member) && Math.sqrt(sum / meter.data.length) > 0.025,
          );
        }
      }, 150);
    } catch {
      /* Activity glow is optional; audio remains independent. */
    }
  }

  private unmonitor(id: string) {
    this.meters.get(id)?.source.disconnect();
    this.meters.delete(id);
    this.options.speaking(id, false);
    if (!this.meters.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private closePeer(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.peers.delete(id);
    this.options.remote(id, null);
    this.unmonitor(id);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMicrophone();
    for (const id of this.peers.keys()) this.closePeer(id);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
  }
}
