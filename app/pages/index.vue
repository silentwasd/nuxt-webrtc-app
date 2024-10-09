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
let peerConnection: RTCPeerConnection;
let dataChannel: RTCDataChannel;

const socketAvailable  = ref<boolean>(false);
const peerAvailable    = ref<boolean>(false);
const messageAvailable = ref<boolean>(false);

const users        = ref<string[]>([]);
const selectedUser = ref<string>();
const myUser       = ref<string>();
const message      = ref<string>('');
const messages     = ref<any[]>([]);

const inputRef  = ref();
const scrollRef = ref();

const mineVideoRef = ref();
const mineAudioRef = ref();

const friendVideoRef = ref();
const friendAudioRef = ref();

const selectedVideo = ref();
const selectedAudio = ref();

const selectedVideoDeviceId = computed(() => selectedVideo.value ? {deviceId: selectedVideo.value?.deviceId} : false);
const selectedAudioDeviceId = computed(() => selectedAudio.value ? {deviceId: selectedAudio.value?.deviceId} : false);

const {videoInputs: cameras, audioInputs: microphones} = useDevicesList({requestPermissions: true});

const {stream, start} = useUserMedia({
    constraints: {
        video: selectedVideoDeviceId,
        audio: selectedAudioDeviceId
    }
});

async function connectToUser(user: string) {
    selectedUser.value = user;

    if (peerConnection)
        peerConnection.close();

    peerConnection = makePeerConnection();

    dataChannel = makeDataChannel();

    if (selectedVideo.value || selectedAudio.value) {
        await start();

        if (stream.value) {
            stream.value.getTracks().forEach(track => {
                if (!stream.value)
                    return;

                peerConnection.addTrack(track, stream.value);

                if (track.kind == 'video') {
                    const mediaStream = new MediaStream();
                    mediaStream.addTrack(track);

                    mineVideoRef.value.srcObject = mediaStream;
                    mineVideoRef.value.play();
                }
            });
        }
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', offer, user);
}

function makePeerConnection(): RTCPeerConnection {
    const connection = new RTCPeerConnection({
        iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
    });

    connection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) {
            socket.emit('candidate', event.candidate, selectedUser.value);
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

    return connection;
}

function makeDataChannel() {
    const dataChannel = peerConnection.createDataChannel('channelName');

    dataChannel.onmessage = (event: MessageEvent<any>) => {
        console.log('Message from data channel', event.data);
        messageHandler(event.data);
    };

    dataChannel.onopen = () => {
        console.log('Data channel is open');
        messageAvailable.value = true;
    };

    dataChannel.onclose = () => {
        console.log('Data channel is closed');
        messageAvailable.value = false;
    };

    return dataChannel;
}

function sendMessage() {
    dataChannel.send(message.value);
    messages.value.push({
        from   : 'me',
        content: message.value,
        type   : 'text'
    });
    message.value = '';
}

function sendFile(file: File | null) {
    if (!file)
        return;

    inputRef.value.value = null;

    dataChannel.send(JSON.stringify({type: file.type, forNext: true}));
    dataChannel.send(file);

    messages.value.push({
        from   : 'me',
        content: file,
        type   : 'file'
    });
}

function downloadFile(file: Blob) {
    navigateTo(URL.createObjectURL(file), {open: {target: "_blank"}});
}

let forNextData: any = null;

function messageHandler(data: any) {
    try {
        const _data = JSON.parse(data);

        if (_data.forNext)
            forNextData = _data;

        return;
    } catch {
        messages.value.push({
            from   : selectedUser.value,
            content: data instanceof ArrayBuffer && forNextData ? new Blob([data], {type: forNextData.type}) : data,
            type   : data instanceof ArrayBuffer ? 'file' : 'text'
        });

        forNextData = null;
    }
}

watch(() => messages.value.length, value => {
    setTimeout(() => scrollRef.value.scrollTop = scrollRef.value.scrollHeight, 200);
});

onMounted(() => {
    if (socket) {
        if (peerConnection)
            peerConnection.close();

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
    });

    socket.on('disconnect', () => {
        socketAvailable.value = false;
    });

    socket.on('user_list', (_users: string[]) => {
        users.value = _users;
    });

    socket.on('offer', async (offer: RTCSessionDescriptionInit, from: string) => {
        if (peerConnection)
            peerConnection.close();

        peerConnection = makePeerConnection();

        peerConnection.ondatachannel = (event: RTCDataChannelEvent) => {
            dataChannel = event.channel;

            dataChannel.onmessage = (event: MessageEvent<any>) => {
                console.log('Message from data channel', event.data);
                messageHandler(event.data);
            };

            dataChannel.onopen = () => {
                console.log('Data channel is open');
                messageAvailable.value = true;
            };

            dataChannel.onclose = () => {
                console.log('Data channel is closed');
                messageAvailable.value = false;
            };
        };

        await peerConnection.setRemoteDescription(offer);

        if (selectedVideo.value || selectedAudio.value) {
            await start();

            if (stream.value) {
                stream.value.getTracks().forEach(track => {
                    if (!stream.value)
                        return;

                    peerConnection.addTrack(track, stream.value);

                    if (track.kind == 'video') {
                        const mediaStream = new MediaStream();
                        mediaStream.addTrack(track);

                        mineVideoRef.value.srcObject = mediaStream;
                        mineVideoRef.value.play();
                    }
                });
            }
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('answer', answer, from);

        selectedUser.value = from;
    });

    socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
        await peerConnection.setRemoteDescription(answer);
    });

    socket.on('candidate', (candidate: RTCIceCandidate) => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                      .catch(error => {
                          console.error('Error adding received ICE candidate', error);
                      });
    });
});

onBeforeUnmount(() => {
    if (socket)
        socket.disconnect();
});
</script>

<template>
    <UContainer class="py-5">
        <div class="flex gap-5">
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

            <UCard class="flex flex-col grow h-[300px]" :ui="{body: {base: 'grow h-0', padding: ''}}">
                <template #header>
                    <h5 class="font-semibold">Data channel</h5>
                </template>

                <div ref="scrollRef" class="flex flex-col gap-2 grow h-full overflow-auto px-6 py-4">
                    <div v-for="message in messages">
                        <span class="font-semibold">{{ message.from }}:</span>

                        <span v-if="message.type == 'text'" class="ms-1.5">
                        {{ message.content }}
                    </span>

                        <div v-else class="inline-flex items-center gap-1.5 ms-1.5 border rounded-md px-1.5 py-1">
                            <span class="text-sm">File</span>
                            <UButton size="xs"
                                     icon="i-heroicons-arrow-down-tray"
                                     color="gray"
                                     @click="downloadFile(message.content)"/>
                        </div>
                    </div>
                </div>

                <template #footer>
                    <div class="flex gap-2.5">
                        <input ref="inputRef"
                               type="file"
                               class="hidden"
                               @change="sendFile($event.target.files[0] ?? null)"/>

                        <UButton color="gray"
                                 icon="i-heroicons-paper-clip-solid"
                                 :disabled="!messageAvailable"
                                 @click="inputRef.click()"/>

                        <UInput placeholder="Enter message..."
                                class="grow"
                                @keydown.enter="sendMessage"
                                v-model="message"/>

                        <UButton label="Send"
                                 color="gray"
                                 :disabled="message.trim().length == 0 || !messageAvailable"
                                 @click="sendMessage"/>
                    </div>
                </template>
            </UCard>
        </div>

        <div class="mt-5 flex gap-5">
            <UCard class="flex flex-col grow w-1/2">
                <template #header>
                    <h5 class="font-semibold">Me</h5>
                </template>

                <div class="flex flex-col gap-2.5">
                    <video ref="mineVideoRef" controls autoplay playsinline class="w-full h-full aspect-[4/3]"/>
                    <audio ref="mineAudioRef" autoplay controls/>

                    <div class="flex gap-2.5">
                        <UFormGroup label="Video" class="w-1/2">
                            <USelectMenu placeholder="Select video device"
                                         :options="cameras"
                                         v-model="selectedVideo"/>
                        </UFormGroup>

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

        <div class="mt-5">
            <UCard>
                <template #header>
                    <h5 class="font-semibold">Status</h5>
                </template>

                <div class="flex flex-col gap-2.5">
                    <SignalLabel :active="socketAvailable" label="Socket connection"/>
                    <SignalLabel :active="peerAvailable" label="Peer connection"/>
                    <SignalLabel :active="messageAvailable" label="Data channel connection"/>
                </div>
            </UCard>
        </div>
    </UContainer>
</template>
