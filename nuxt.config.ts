// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    extends: ['@nuxt/ui-pro'],

    modules: [
        '@nuxt/ui',
        '@vueuse/nuxt'
    ],

    routeRules: {
        // Temporary workaround for prerender regression. see https://github.com/nuxt/nuxt/issues/27490
        '/': {prerender: true}
    },

    devtools: {
        enabled: true
    },

    future: {
        compatibilityVersion: 4
    },

    compatibilityDate: '2024-07-11',

    devServer: {
        host: '0.0.0.0',
        port: 3001,

        https: {
            key : './privkey.pem',
            cert: './fullchain.pem'
        }
    }
})
