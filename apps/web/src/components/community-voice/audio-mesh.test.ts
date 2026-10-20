import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceMember, VoiceRoomSnapshot, VoiceSignal } from '@/lib/community-voice/contracts';
import { VoiceAudioMesh } from './audio-mesh';

const user = (id: string, seat: number | null, muted = true): VoiceMember => ({
  id,
  seat,
  muted,
  mutedByModerator: false,
  role: seat === 0 ? 'HOST' : 'MEMBER',
  requestedSeat: false,
  joinedAt: 1,
  connectionEpoch: 1,
  identity: {
    userId: id,
    accountNumber: 123456789,
    name: id,
    username: null,
    avatarUrl: null,
    badges: [],
    frame: null,
    effect: null,
    primaryBadge: null,
  },
});
const snapshot = (members: VoiceMember[], signals: VoiceSignal[] = []): VoiceRoomSnapshot => ({
  id: 'room',
  code: '123456',
  name: 'Room',
  imageUrl: null,
  ownerId: 'a',
  memberCount: members.length,
  createdAt: 1,
  status: 'OPEN',
  selfMemberId: 'a',
  canModerate: true,
  revision: 1,
  cursor: 1,
  serverTime: 1,
  members,
  signals,
  messages: [],
  reactions: [],
  entrances: [],
});
const makeTrack = () => ({ stop: vi.fn(), enabled: true, readyState: 'live', kind: 'audio' });
let receivedTrack = makeTrack();
class Peer {
  static instances: Peer[] = [];
  onicecandidate: ((event: { candidate: { toJSON: () => object } }) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: object) => void) | null = null;
  signalingState = 'stable';
  connectionState = 'new';
  remoteDescription: object | null = null;
  localDescription: { type: string; sdp: string } | null = null;
  addCount = 0;
  transceiver = {
    mid: null as string | null,
    direction: 'inactive',
    receiver: { track: receivedTrack },
    sender: { replaceTrack: vi.fn(async () => undefined) },
  };
  orphan: typeof this.transceiver | null = null;
  close = vi.fn();
  setConfiguration = vi.fn();
  constructor() {
    Peer.instances.push(this);
  }
  addTransceiver(_kind: string, options: { direction: string }) {
    this.addCount += 1;
    this.transceiver.direction = options.direction;
    return this.transceiver;
  }
  getTransceivers() {
    return this.addCount || this.remoteDescription
      ? [...(this.orphan ? [this.orphan] : []), this.transceiver]
      : [];
  }
  getReceivers() {
    return [{ track: receivedTrack }];
  }
  async createOffer() {
    return { type: 'offer', sdp: this.transceiver.direction };
  }
  async createAnswer() {
    return { type: 'answer', sdp: this.transceiver.direction };
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate:fixture' }) } });
  }
  async setRemoteDescription(description: { type: string; sdp: string }) {
    this.remoteDescription = description;
    this.transceiver.mid = '0';
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  addIceCandidate = vi.fn(async () => undefined);
}
const capture = vi.fn();
type Send = (target: string, kind: VoiceSignal['kind'], payload: string) => Promise<void>;
const makeMesh = (send: Send = vi.fn(async () => undefined)) => ({
  mesh: new VoiceAudioMesh({ send, remote: vi.fn(), speaking: vi.fn(), error: vi.fn() }),
  send,
});

beforeEach(() => {
  Peer.instances = [];
  receivedTrack = makeTrack();
  capture.mockReset();
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('AudioContext', undefined);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: capture } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('voice capture and negotiation boundaries', () => {
  it('never asks for a microphone during joining or speaker approval', async () => {
    const { mesh } = makeMesh();
    await mesh.sync(snapshot([user('a', 0, false), user('b', null)]), []);
    expect(capture).not.toHaveBeenCalled();
    mesh.dispose();
  });
  it('rejects capture for listeners without touching browser permission', async () => {
    const { mesh } = makeMesh();
    await mesh.sync(snapshot([user('a', null)]), []);
    await expect(mesh.startMicrophone()).rejects.toThrow('مقعدًا');
    expect(capture).not.toHaveBeenCalled();
    mesh.dispose();
  });
  it('stops tracks from a permission prompt that resolves after leaving', async () => {
    const track = makeTrack();
    let resolve!: (stream: object) => void;
    capture.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { mesh } = makeMesh();
    await mesh.sync(snapshot([user('a', 0, false)]), []);
    const pending = mesh.startMicrophone();
    mesh.dispose();
    resolve({ getTracks: () => [track], getAudioTracks: () => [track] });
    await pending;
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it('stops an active capture when server forces mute', async () => {
    const track = makeTrack();
    capture.mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] });
    const { mesh } = makeMesh();
    await mesh.sync(snapshot([user('a', 0, false), user('b', null)]), []);
    await mesh.startMicrophone();
    expect(mesh.microphoneActive).toBe(true);
    await mesh.sync(snapshot([user('a', 0, true), user('b', null)]), []);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(Peer.instances[0].transceiver.sender.replaceTrack).toHaveBeenLastCalledWith(null);
    mesh.dispose();
  });
  it('suppresses incoming audio when a remote member is muted', async () => {
    const { mesh } = makeMesh();
    await mesh.sync(snapshot([user('a', null), user('b', 1, false)]), []);
    await mesh.sync(snapshot([user('a', null), user('b', 1, true)]), []);
    expect(receivedTrack.enabled).toBe(false);
    mesh.dispose();
  });
  it('buffers local ICE until the server accepts the offer', async () => {
    let accept!: () => void;
    const send = vi.fn(async (_target: string, kind: VoiceSignal['kind']) => {
      if (kind === 'offer')
        await new Promise<void>((resolve) => {
          accept = resolve;
        });
    });
    const { mesh } = makeMesh(send);
    await mesh.sync(snapshot([user('a', 0, false), user('b', null)]), []);
    Peer.instances[0].onnegotiationneeded?.();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][1]).toBe('offer');
    accept();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][1]).toBe('ice');
    mesh.dispose();
  });
  it('answers as recvonly for listeners and drains early remote ICE after SDP', async () => {
    const send = vi.fn(async () => undefined);
    const { mesh } = makeMesh(send);
    await mesh.sync(
      snapshot(
        [user('a', null), user('0', 1, false)],
        [
          {
            id: 'ice-1',
            from: '0',
            kind: 'ice',
            payload: JSON.stringify({ candidate: 'candidate:early' }),
            at: 1,
          },
          { id: 'offer-1', from: '0', kind: 'offer', payload: 'remote-offer', at: 2 },
        ],
      ),
      [],
    );
    expect(send).toHaveBeenCalledWith('0', 'answer', 'recvonly');
    expect(Peer.instances[0].addCount).toBe(0);
    expect(Peer.instances[0].addIceCandidate).toHaveBeenCalledWith({
      candidate: 'candidate:early',
    });
    mesh.dispose();
  });
  it('cleans up peer connections and makes repeated disposal harmless', async () => {
    const { mesh } = makeMesh();
    await mesh.sync(snapshot([user('a', 0), user('b', null)]), []);
    const peer = Peer.instances[0];
    mesh.dispose();
    mesh.dispose();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(peer.ontrack).toBeNull();
    expect(peer.onicecandidate).toBeNull();
  });
  it('keeps the same receive-only initiator after seat approval and queues in-flight direction changes', async () => {
    const send = vi.fn(async () => undefined);
    const { mesh } = makeMesh(send);
    const first = snapshot([user('a', null), user('z', 0)]);
    await mesh.sync(first, []);
    const peer = Peer.instances[0];
    peer.onnegotiationneeded?.();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('z', 'offer', 'inactive'));
    await mesh.sync(
      snapshot(first.members, [
        { id: 'answer-1', from: 'z', kind: 'answer', payload: 'inactive', at: 1 },
      ]),
      [],
    );
    await mesh.sync(snapshot([user('a', 1, false), user('z', 0)]), []);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('z', 'offer', 'sendonly'));
    // The other speaker unmutes while this side is still awaiting an answer.
    await mesh.sync(snapshot([user('a', 1, false), user('z', 0, false)]), []);
    await mesh.sync(
      snapshot(
        [user('a', 1, false), user('z', 0, false)],
        [{ id: 'answer-2', from: 'z', kind: 'answer', payload: 'recvonly', at: 2 }],
      ),
      [],
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('z', 'offer', 'sendrecv'));
    expect(peer.addCount).toBe(1);
    expect(Peer.instances).toHaveLength(1);
    mesh.dispose();
  });

  it('attaches capture to the negotiated audio mid instead of an orphan left by rollback', async () => {
    const track = makeTrack();
    capture.mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] });
    const send = vi.fn(async () => undefined);
    const { mesh } = makeMesh(send);
    await mesh.sync(snapshot([user('a', 0, false), user('0', 1, false)]), []);
    const peer = Peer.instances[0];
    const orphan = {
      mid: null,
      direction: 'sendrecv',
      receiver: { track: makeTrack() },
      sender: { replaceTrack: vi.fn(async () => undefined) },
    };
    peer.orphan = orphan;
    await mesh.startMicrophone();
    await mesh.sync(
      snapshot(
        [user('a', 0, false), user('0', 1, false)],
        [
          {
            id: 'offer-mid',
            from: '0',
            kind: 'offer',
            payload: 'v=0\r\nm=audio 9 RTP/AVP 111\r\na=mid:0\r\na=sendrecv\r\n',
            at: 1,
          },
        ],
      ),
      [],
    );
    expect(peer.transceiver.sender.replaceTrack).toHaveBeenLastCalledWith(track);
    expect(orphan.sender.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(orphan.direction).toBe('inactive');
    expect(send).toHaveBeenCalledWith('0', 'answer', 'sendrecv');
    expect(peer.addCount).toBe(0);
    mesh.dispose();
  });
  it('retries queued negotiation when an answer arrives before outgoing ICE finishes', async () => {
    let releaseIce!: () => void;
    let blocked = true;
    const send = vi.fn(async (_target: string, kind: VoiceSignal['kind']) => {
      if (kind === 'ice' && blocked) {
        blocked = false;
        await new Promise<void>((resolve) => {
          releaseIce = resolve;
        });
      }
    });
    const { mesh } = makeMesh(send);
    await mesh.sync(snapshot([user('a', 0), user('z', null)]), []);
    Peer.instances[0].onnegotiationneeded?.();
    await vi.waitFor(() => expect(releaseIce).toBeTypeOf('function'));
    await mesh.sync(
      snapshot(
        [user('a', 0, false), user('z', null)],
        [{ id: 'answer-before-ice', from: 'z', kind: 'answer', payload: 'inactive', at: 1 }],
      ),
      [],
    );
    releaseIce();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('z', 'offer', 'sendonly'));
    mesh.dispose();
  });
});
