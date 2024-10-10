<script setup lang="ts">
import {io, Socket} from "socket.io-client";

function generateRandomNickname(length = 8): string {
    const adjectives = ['Funny', 'Fastly', 'Slowly', 'Smartly', 'Strongly', 'Bravely', 'Easily', 'Loudly', 'Quietly', 'Happily', 'Carefully', 'Cleverly', 'Boldly', 'Warmly', 'Slyly'];
    const nouns      = ['Cat', 'Dog', 'Dragon', 'Soldier', 'Hero', 'Wizard', 'Knight', 'Vampire', 'Fairy', 'Monster', 'Pirate', 'Robot', 'Ninja', 'Ghost', 'Alien'];

    // Выбор случайного прилагательного и существительного
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun      = nouns[Math.floor(Math.random() * nouns.length)];

    // Генерация случайной строки
    const randomString = Array.from({length}, () => {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return characters.charAt(Math.floor(Math.random() * characters.length));
    }).join('');

    // Формирование ника
    return `${randomAdjective}${randomNoun}_${randomString}`;
}

let socket: Socket;

const peerConnection        = ref<RTCPeerConnection>();
const peerConnectionLoading = ref<boolean>(false);

const socketAvailable = ref<boolean>(false);
const peerAvailable   = ref<boolean>(false);

const users        = ref<string[]>([]);
const selectedUser = ref<string>();
const myUser       = ref<string>();

const inputRef  = ref();
const scrollRef = ref();

const mineVideoRef = ref();
const mineAudioRef = ref();

const friendVideoRef = ref();
const friendAudioRef = ref();

const selectedVideo           = ref();
const selectedVideoResolution = ref();
const selectedVideoFrameRate  = ref();
const selectedAudio           = ref();

const videoResolutions = computed(() => {
    if (!selectedVideo.value)
        return [];

    const cpb = selectedVideo.value.getCapabilities();

    return [{
        width : cpb.width.max,
        height: cpb.height.max,
        label : cpb.width.max + ' x ' + cpb.height.max
    }]
});

const videoFrameRates = computed(() => {
    if (!selectedVideo.value)
        return [];

    const cpb = selectedVideo.value.getCapabilities();

    return [{
        value: cpb.frameRate.max,
        label: cpb.frameRate.max.toFixed(2) + ' FPS'
    }]
});

watch(videoResolutions, value => {
    selectedVideoResolution.value = value[0] ?? undefined;
});

watch(videoFrameRates, value => {
    selectedVideoFrameRate.value = value[0] ?? undefined;
});

const statistics = ref([]);

const selectedVideoDevice = computed(() => selectedVideo.value ? {
    deviceId : selectedVideo.value?.deviceId,
    width    : {ideal: selectedVideoResolution.value.width},
    height   : {ideal: selectedVideoResolution.value.height},
    frameRate: {ideal: selectedVideoFrameRate.value.value}

} : false);
const selectedAudioDevice = computed(() => selectedAudio.value ? {deviceId: selectedAudio.value?.deviceId} : false);

const {videoInputs: cameras, audioInputs: microphones, devices} = useDevicesList({requestPermissions: true});

watch(cameras, value => {
    value.forEach(camera => console.log(camera.label, camera.getCapabilities()));
}, {immediate: true});

const {stream, start} = useUserMedia({
    constraints: {
        video: selectedVideoDevice,
        audio: selectedAudioDevice
    }
});

async function addStreamTo(connection: RTCPeerConnection) {
    if (selectedVideo.value || selectedAudio.value) {
        await start();

        if (stream.value) {
            stream.value.getTracks().forEach(track => {
                if (!stream.value)
                    return;

                connection.addTrack(track, stream.value);

                if (track.kind == 'audio') {
                    const mediaStream = new MediaStream();
                    mediaStream.addTrack(track);

                    mineAudioRef.value.srcObject = mediaStream;
                    mineAudioRef.value.volume    = 0;
                    mineAudioRef.value.play();
                }

                if (track.kind == 'video') {
                    const mediaStream = new MediaStream();
                    mediaStream.addTrack(track);

                    mineVideoRef.value.srcObject = mediaStream;
                    mineVideoRef.value.play();
                }
            });
        }
    }
}

async function connectToUser(user: string) {
    if (!peerConnection.value)
        peerConnection.value = await makePeerConnection();

    selectedUser.value = user;

    await addStreamTo(peerConnection.value);

    const offer = await peerConnection.value.createOffer();
    console.log('Make offer', offer);
    await peerConnection.value.setLocalDescription(offer);
    console.log('Set local description to offer');

    socket.emit('offer', offer, user);
    console.log('Emit offer to', user);
}

async function makePeerConnection(): Promise<RTCPeerConnection> {
    peerConnectionLoading.value = true;

    const connection = new RTCPeerConnection({
        iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
    });

    console.log('Peer connection constructed');

    connection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) {
            socket.emit('candidate', event.candidate, selectedUser.value);
            console.log('Emit candidate', event.candidate);
        }
    };

    connection.ontrack = (event: RTCTrackEvent) => {
        console.log('On track', event);

        if (event.track.kind == 'audio') {
            const mediaStream = new MediaStream();
            mediaStream.addTrack(event.track);

            friendAudioRef.value.srcObject = mediaStream;
            friendAudioRef.value.volume    = 1;
            friendAudioRef.value.play();
        }

        if (event.track.kind == 'video') {
            const mediaStream = new MediaStream();
            mediaStream.addTrack(event.track);

            friendVideoRef.value.srcObject = mediaStream;
            friendVideoRef.value.play();
        }
    };

    connection.onconnectionstatechange = () => {
        peerAvailable.value = connection.connectionState == "connected";
    };

    peerConnectionLoading.value = false;

    return connection;
}

watch(peerConnection, connection => {
    setInterval(() => {
        if (connection?.connectionState != 'connected')
            return;

        connection.getStats(null).then(stats => {
            statistics.value = [...stats];
        });
    }, 1000);
});

onMounted(() => {
    if (socket) {
        if (peerConnection.value)
            peerConnection.value.close();

        if (selectedUser.value)
            selectedUser.value = undefined;

        socket.disconnect();
    }

    socket = io('https://webrtc.vrkitty.ru:3000', {
        transports: ['websocket']
    });

    socket.on('connect', () => {
        socketAvailable.value = true;

        const username = generateRandomNickname();
        socket.emit('register', username);
        myUser.value = username;

        console.log('Connect as', username);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected');
        socketAvailable.value = false;
    });

    socket.on('user_list', (_users: string[]) => {
        users.value = _users;
    });

    socket.on('offer', async (offer: RTCSessionDescriptionInit, from: string) => {
        if (!peerConnection.value)
            peerConnection.value = await makePeerConnection();

        console.log('Catch offer from', from);

        await peerConnection.value.setRemoteDescription(offer);
        console.log('Set remote description', offer);

        await addStreamTo(peerConnection.value);

        const answer = await peerConnection.value.createAnswer();
        console.log('Make answer', answer);

        await peerConnection.value.setLocalDescription(answer);
        console.log('Set local description to answer');

        socket.emit('answer', answer, from);
        console.log('Emit answer to', from);

        selectedUser.value = from;
    });

    socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
        console.log('Catch answer', answer);
        await peerConnection.value.setRemoteDescription(answer);
        console.log('Set remote description to answer');

        socket.emit('ready', selectedUser.value);
        console.log('Emit ready signal to', selectedUser.value);
    });

    socket.on('candidate', (candidate: RTCIceCandidate) => {
        console.log('Catch candidate', candidate);
        peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate))
                      .catch(error => {
                          console.error('Error adding received ICE candidate', error);
                      });
        console.log('Add ice candidate');
    });

    socket.on('ready', async (from: string) => {
        console.log('Catch ready signal from', from);
    });
});

onBeforeUnmount(() => {
    if (socket)
        socket.disconnect();
});
</script>

<template>
    <UContainer class="py-5">
        <UCard class="grow">
            <template #header>
                <h5 class="font-semibold">Users</h5>
            </template>

            <div class="flex flex-col gap-2.5">
                <UButton v-for="user in users"
                         :label="myUser == user ? 'Me' : user"
                         icon="i-heroicons-user"
                         :variant="user == selectedUser ? 'solid' : 'soft'"
                         color="gray"
                         :disabled="user == selectedUser || user == myUser"
                         @click="connectToUser(user)"/>
            </div>
        </UCard>

        <div class="mt-5 flex gap-5">
            <UCard class="flex flex-col grow w-1/2">
                <template #header>
                    <div class="flex justify-between items-center">
                        <h5 class="font-semibold">Me</h5>
                    </div>
                </template>

                <div class="flex flex-col gap-2.5">
                    <video ref="mineVideoRef" controls autoplay playsinline class="w-full h-full aspect-[4/3]"/>
                    <audio ref="mineAudioRef" autoplay controls/>

                    <div class="flex gap-2.5">
                        <div class="flex flex-col gap-2.5 w-1/2">
                            <UFormGroup label="Video">
                                <USelectMenu placeholder="Select video device"
                                             :options="cameras"
                                             v-model="selectedVideo"/>
                            </UFormGroup>

                            <UFormGroup v-if="selectedVideo" label="Resolution">
                                <USelectMenu placeholder="Select video device"
                                             :options="videoResolutions"
                                             v-model="selectedVideoResolution"/>
                            </UFormGroup>

                            <UFormGroup v-if="selectedVideo" label="Frame rate">
                                <USelectMenu placeholder="Select frame rate"
                                             :options="videoFrameRates"
                                             v-model="selectedVideoFrameRate"/>
                            </UFormGroup>
                        </div>

                        <UFormGroup label="Audio" class="w-1/2">
                            <USelectMenu placeholder="Select audio device"
                                         :options="microphones"
                                         v-model="selectedAudio"/>
                        </UFormGroup>
                    </div>
                </div>
            </UCard>

            <UCard class="flex flex-col grow w-1/2">
                <template #header>
                    <h5 class="font-semibold">Friend</h5>
                </template>

                <div class="flex flex-col gap-2.5">
                    <video ref="friendVideoRef" controls autoplay playsinline class="w-full h-full aspect-[4/3]"/>
                    <audio ref="friendAudioRef" autoplay controls/>
                </div>
            </UCard>
        </div>

        <div class="mt-5 flex gap-5">
            <UCard class="flex flex-col grow w-1/2">
                <template #header>
                    <h5 class="font-semibold">Status</h5>
                </template>

                <div class="flex flex-col gap-2.5">
                    <SignalLabel :active="socketAvailable" label="Socket connection"/>
                    <SignalLabel :active="peerAvailable" label="Peer connection"/>
                </div>
            </UCard>

            <UCard class="flex flex-col grow w-1/2" :ui="{body: {padding: ''}}">
                <template #header>
                    <h5 class="font-semibold">Statistics</h5>
                </template>

                <div class="overflow-auto h-[400px] p-6 flex flex-col gap-5">
                    <div
                        v-for="stat in statistics.filter(_stat => ['inbound-rtp', 'outbound-rtp'].includes(_stat[1].type))">
                        <p class="font-semibold text-xl">{{ stat[1].type }}</p>
                        <p>Kind: {{ stat[1].kind }}</p>
                        <p>Codec ID: {{ stat[1].codecId }}</p>
                        <p>Packets received: {{ stat[1].packetsReceived }} / {{ stat[1].packetsLost }} /
                            {{ stat[1].packetsDiscarded }}</p>
                        <p>Bytes received: {{ stat[1].bytesReceived }}</p>
                    </div>
                </div>
            </UCard>
        </div>
    </UContainer>
</template>
