<script setup>
const links = [{
    label: 'Main',
    to: '/'
}];

useHead({
    meta: [
        {name: 'viewport', content: 'width=device-width, initial-scale=1'}
    ],
    link: [
        {rel: 'icon', href: '/favicon.ico'}
    ],
    htmlAttrs: {
        lang: 'en'
    }
});
</script>

<template>
    <Head>
        <title>WebRTC Test</title>
    </Head>

    <UHeader :links="links">
        <template #logo>
            WebRTC Test
        </template>

        <template #right>
            <UColorModeButton/>
        </template>
    </UHeader>

    <UMain>
        <NuxtPage/>
    </UMain>
</template>
