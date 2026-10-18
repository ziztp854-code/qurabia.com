#!/usr/bin/env python3
"""Local-only real SFU smoke test with generated PCM, not physical microphones.
Requires isolated venv: pip install livekit==1.0.25 livekit-api==1.1.0 numpy.
Uses LIVEKIT_* environment, only allows loopback, writes no credentials/audio.
"""
import asyncio, datetime, json, math, os, sys, time, urllib.request, wave
from pathlib import Path
from urllib.parse import urlparse
import numpy as np
from livekit import rtc, api

async def main():
    internal = os.environ.get('LIVEKIT_INTERNAL_URL') or os.environ['LIVEKIT_URL']
    gateway_test = os.environ.get('VOICE_SFU_GATEWAY_TEST') == '1'
    url = 'ws://127.0.0.1:7891' if gateway_test else internal
    if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
        raise RuntimeError('This synthetic test is restricted to a local SFU.')
    key, secret = os.environ['LIVEKIT_API_KEY'], os.environ['LIVEKIT_API_SECRET']
    room_name = 'voice-synthetic-' + str(int(time.time()))
    admin = api.LiveKitAPI(url=internal.replace('ws:', 'http:'), api_key=key, api_secret=secret)
    rooms, jobs, streams = [], [], []
    received = {'a': [], 'b': []}
    def token(identity, publish=False):
        return (api.AccessToken(key, secret).with_identity(identity).with_metadata(json.dumps({'voiceSessionVersion':0}))
                .with_ttl(datetime.timedelta(seconds=60))
                .with_grants(api.VideoGrants(room_join=True, room=room_name,
                    can_publish=publish, can_subscribe=True, can_publish_data=False,
                    can_publish_sources=['microphone'])).to_jwt())
    def control(path, data=None):
        payload = None if data is None else json.dumps(data).encode()
        request = urllib.request.Request('http://127.0.0.1:7892'+path, data=payload, headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=3) as response: return json.load(response)
    def membership(identity, publish, member=True, version=0):
        control('/state', {'room':room_name,'identity':identity,'canPublish':publish,'member':member,'version':version})
    async def refreshed_token(identity):
        for _ in range(40):
            response = control('/refresh?room='+room_name+'&identity='+identity)
            if response.get('token'): return response['token']
            await asyncio.sleep(.1)
        raise AssertionError('SFU refreshed token was not observed')
    async def consume(track, receiver):
        stream = rtc.AudioStream(track, sample_rate=48000, num_channels=1)
        streams.append(stream)
        async for event in stream:
            received[receiver].append(np.frombuffer(event.frame.data, dtype=np.int16).copy())
    def connect_events(room, receiver):
        @room.on('track_subscribed')
        def subscribed(track, publication, participant):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                jobs.append(asyncio.create_task(consume(track, receiver)))
    async def grant(identity, publish=True):
        await admin.room.update_participant(api.UpdateParticipantRequest(room=room_name, identity=identity,
            permission=api.ParticipantPermission(can_subscribe=True, can_publish=publish,
                can_publish_data=False, can_publish_sources=[api.TrackSource.MICROPHONE])))
    async def wait_for(predicate, timeout=8):
        end = time.monotonic() + timeout
        while not predicate():
            if time.monotonic() > end: raise AssertionError('Timed out waiting for SFU state')
            await asyncio.sleep(.1)
    async def emit(source, hz):
        phase = 0
        while True:
            data = (np.sin((np.arange(480) + phase) * (2 * math.pi * hz / 48000)) * 10000).astype(np.int16)
            phase += 480
            await source.capture_frame(rtc.AudioFrame(data.tobytes(), 48000, 1, 480))
            await asyncio.sleep(.01)
    def energy(receiver, count=30):
        frames = received[receiver][-count:]
        if not frames: return 0
        samples = np.concatenate(frames).astype(float)
        return float(np.sqrt(np.mean(samples**2)))
    def frequency(receiver):
        samples = np.concatenate(received[receiver][-30:]).astype(float)
        return float(np.fft.rfftfreq(len(samples), 1/48000)[np.argmax(np.abs(np.fft.rfft(samples)))])
    result = {'scope': 'two native WebRTC clients on one machine, generated PCM via real local LiveKit SFU',
              'physical_devices_tested': False, 'gateway_fixture': gateway_test, 'room': room_name, 'checks': {}}
    try:
        a, b = rtc.Room(), rtc.Room(); rooms.extend([a,b])
        connect_events(a,'a'); connect_events(b,'b')
        if gateway_test: membership('a',True); membership('b',False)
        old_token = token('a', True)
        await a.connect(url, old_token); await b.connect(url, token('b'))
        await asyncio.sleep(.4)
        result['checks']['initial_listener_cannot_publish'] = not (await admin.room.get_participant(api.RoomParticipantIdentity(room=room_name,identity='b'))).permission.can_publish
        assert result['checks']['initial_listener_cannot_publish']
        old_refreshed = await refreshed_token('a') if gateway_test else None
        if gateway_test: membership('b',True)
        await grant('a'); await grant('b')
        await asyncio.sleep(.3)
        source_a, source_b = rtc.AudioSource(48000,1,100), rtc.AudioSource(48000,1,100)
        track_a = rtc.LocalAudioTrack.create_audio_track('generated-a',source_a)
        track_b = rtc.LocalAudioTrack.create_audio_track('generated-b',source_b)
        opts = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        print('publishing generated sources',file=sys.stderr,flush=True)
        pub_a = await asyncio.wait_for(a.local_participant.publish_track(track_a,opts),8)
        await asyncio.wait_for(b.local_participant.publish_track(track_b,opts),8)
        print('waiting for remote PCM',file=sys.stderr,flush=True)
        jobs.extend([asyncio.create_task(emit(source_a,440)),asyncio.create_task(emit(source_b,660))])
        await wait_for(lambda: len(received['a'])>80 and len(received['b'])>80)
        result['received'] = {'a': {'frames':len(received['a']),'rms':energy('a'),'frequency_hz':frequency('a')},
                              'b': {'frames':len(received['b']),'rms':energy('b'),'frequency_hz':frequency('b')}}
        sample_path = os.environ.get('VOICE_TEST_AUDIO_SAMPLE')
        if sample_path:
            with wave.open(sample_path,'wb') as sample:
                sample.setnchannels(1);sample.setsampwidth(2);sample.setframerate(48000)
                sample.writeframes(np.concatenate(received['b']).astype(np.int16).tobytes())
            result['synthetic_received_sample'] = sample_path
        result['checks']['bidirectional_audio'] = abs(frequency('a')-660)<15 and abs(frequency('b')-440)<15 and energy('a')>100 and energy('b')>100
        assert result['checks']['bidirectional_audio']
        print('PCM received; testing mute',file=sys.stderr,flush=True)
        track_a.mute(); await asyncio.sleep(1)
        result['checks']['microphone_mute'] = energy('b') < 100
        assert result['checks']['microphone_mute'], energy('b')
        track_a.unmute(); await asyncio.sleep(1)
        result['checks']['microphone_unmute'] = energy('b')>100
        assert result['checks']['microphone_unmute']
        print('testing SFU role enforcement',file=sys.stderr,flush=True)
        if gateway_test: membership('a',False)
        await grant('a',False)
        await asyncio.sleep(.3)
        await asyncio.sleep(.6)
        # Server permissions prevent new publication, not just a disabled UI.
        denied = False
        try:
            await asyncio.wait_for(a.local_participant.publish_track(rtc.LocalAudioTrack.create_audio_track('forbidden',source_a),opts),3)
        except Exception:
            denied = True
        result['checks']['listener_publish_denied_by_sfu'] = denied
        assert denied
        print('testing token revocation',file=sys.stderr,flush=True)
        await admin.room.remove_participant(api.RoomParticipantIdentity(room=room_name,identity='a',revoke_token_ts=int(time.time())+1))
        await a.disconnect()
        before = len(received['b']); await asyncio.sleep(.6)
        result['checks']['leave_stops_remote_audio'] = len(received['b']) <= before + 5
        assert result['checks']['leave_stops_remote_audio']
        if gateway_test:
            # These are actual original and server-refreshed publisher JWTs. The fixture
            # exchanges both for the current listener role before either reaches the SFU.
            for label, old in [('original',old_token),('server_refreshed',old_refreshed)]:
                replay=rtc.Room(); rooms.append(replay)
                await asyncio.wait_for(replay.connect(url,old),8)
                current=await admin.room.get_participant(api.RoomParticipantIdentity(room=room_name,identity='a'))
                result['checks'][label+'_publisher_token_rejoins_as_listener'] = not current.permission.can_publish
                assert not current.permission.can_publish
                await replay.disconnect()
            membership('a',False,member=False)
            for label, old in [('original',old_token),('server_refreshed',old_refreshed)]:
                replay=rtc.Room();rooms.append(replay);rejected=False
                try: await asyncio.wait_for(replay.connect(url,old),8)
                except rtc.ConnectError: rejected=True
                result['checks'][label+'_removed_member_denied_before_sfu'] = rejected
                assert rejected
            membership('a',False,member=True,version=1)
            replay=rtc.Room();rooms.append(replay);rejected=False
            try: await asyncio.wait_for(replay.connect(url,old_refreshed),8)
            except rtc.ConnectError: rejected=True
            result['checks']['revoked_session_version_denied'] = rejected
            assert rejected
            result['known_limitations'] = ['Gateway transport and real JWT refresh tested against test-only in-memory membership. NextAuth and database admission are covered by separate application tests.']
            result['passed_core_audio_and_gateway_checks'] = all(result['checks'].values())
        else:
            # Provider diagnostic: raw OSS removal does not invalidate old JWTs.
            replay=rtc.Room();rooms.append(replay);rejected=False
            try: await asyncio.wait_for(replay.connect(url,old_token),10)
            except rtc.ConnectError: rejected=True
            result['checks']['raw_sfu_revoked_token_replay_denied']=rejected
            result['known_limitations']=[] if rejected else ['Raw OSS SFU accepts reused publisher JWT after removal. Isolate it behind the admission gateway; test gateway replay denial separately.']
            result['passed_core_audio_checks']=all(value for name,value in result['checks'].items() if name!='raw_sfu_revoked_token_replay_denied')
    finally:
        for job in jobs: job.cancel()
        await asyncio.gather(*jobs,return_exceptions=True)
        for stream in streams:
            try: await asyncio.wait_for(stream.aclose(),2)
            except Exception: pass
        for room in rooms:
            try: await asyncio.wait_for(room.disconnect(),3)
            except Exception: pass
        try: await admin.room.delete_room(api.DeleteRoomRequest(room=room_name))
        except Exception: pass
        finally: await admin.aclose()
        if len(sys.argv)>1: Path(sys.argv[1]).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(result,ensure_ascii=False,indent=2))

asyncio.run(main())
