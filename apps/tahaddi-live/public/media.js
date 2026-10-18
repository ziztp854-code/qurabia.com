export class MediaSession {
  constructor({ send, mediaDevices = globalThis.navigator?.mediaDevices, onRemote, onState = () => {} }) {
    this.send = send;
    this.mediaDevices = mediaDevices;
    this.onRemote = onRemote;
    this.onState = onState;
    this.peers = new Map();
    this.negotiation = new Map();
    this.stream = null;
    this.generation = 0;
    this.selfId = '';
  }

  async enable(mode) {
    if (this.stream) return this.stream;
    if (!this.mediaDevices) throw new Error('الأجهزة غير متاحة. افتح التطبيق عبر localhost أو HTTPS.');
    const generation = this.generation;
    const stream = await this.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return null;
    }
    this.stream = stream;
    for (const peer of this.peers.values()) {
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
    }
    return stream;
  }

  peer(id, initiate = false) {
    if (this.peers.has(id)) return this.peers.get(id);
    const peer = new RTCPeerConnection({ iceServers: this.iceServers || [] });
    const flags = { makingOffer: false, ignoreOffer: false, candidates: [] };
    this.peers.set(id, peer);
    this.negotiation.set(id, flags);
    peer.onicecandidate = event => {
      if (event.candidate) this.send({ type: 'signal', to: id, data: { candidate: event.candidate } });
    };
    peer.ontrack = event => this.onRemote(id, event.streams[0] || new MediaStream([event.track]));
    peer.onconnectionstatechange = () => this.onState(id, peer.connectionState);
    peer.onnegotiationneeded = () => this.offer(id);
    if (this.stream) this.stream.getTracks().forEach(track => peer.addTrack(track, this.stream));
    else if (initiate) {
      peer.addTransceiver('audio', { direction: 'recvonly' });
      peer.addTransceiver('video', { direction: 'recvonly' });
    }
    return peer;
  }

  async offer(id) {
    const peer = this.peers.get(id), flags = this.negotiation.get(id);
    if (!peer || peer.signalingState !== 'stable') return;
    try {
      flags.makingOffer = true;
      await peer.setLocalDescription();
      if (this.peers.get(id) === peer) this.send({ type: 'signal', to: id, data: { description: peer.localDescription } });
    } catch (error) {
      if (this.peers.has(id)) this.onState(id, 'failed', error);
    } finally { flags.makingOffer = false; }
  }

  async signal(id, data) {
    const peer = this.peer(id), flags = this.negotiation.get(id);
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (flags.makingOffer || peer.signalingState !== 'stable');
        flags.ignoreOffer = this.selfId.localeCompare(id) < 0 && collision;
        if (flags.ignoreOffer) return;
        await peer.setRemoteDescription(data.description);
        for (const candidate of flags.candidates) await peer.addIceCandidate(candidate);
        flags.candidates = [];
        if (data.description.type === 'offer') {
          await peer.setLocalDescription();
          this.send({ type: 'signal', to: id, data: { description: peer.localDescription } });
        }
      } else if (data.candidate && !flags.ignoreOffer) {
        if (peer.remoteDescription) await peer.addIceCandidate(data.candidate);
        else flags.candidates.push(data.candidate);
      }
    } catch (error) {
      if (this.peers.has(id) && !flags.ignoreOffer) this.onState(id, 'failed', error);
    }
  }

  remove(id) {
    const peer = this.peers.get(id);
    if (peer) { peer.onnegotiationneeded = null; peer.ontrack = null; peer.onicecandidate = null; peer.onconnectionstatechange = null; peer.close(); }
    this.peers.delete(id);
    this.negotiation.delete(id);
  }

  close() {
    this.generation++;
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;
    for (const id of this.peers.keys()) this.remove(id);
  }
}
