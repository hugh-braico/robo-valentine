export const apps = [{
    name: 'robo-valentine',
    script: './start.sh',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
}];
