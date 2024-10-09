<script setup lang="ts">
defineProps<{
    active: boolean,
    label: string
}>();
</script>

<template>
    <div class="flex gap-2.5 items-center">
        <div class="w-4 h-4 rounded-full animate-pulse"
             :class="{'bg-green-500': active, 'bg-red-500': !active}"></div>
        <p class="font-semibold">{{ label }}</p>
    </div>
</template>

<style scoped>

</style>