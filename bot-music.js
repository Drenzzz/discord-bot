import { Client, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';
import { Player } from 'discord-player';

config(); // Load .env file

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const player = new Player(client);

player.extractors.loadDefault().then(() => {
    console.log("🎵 Extractors loaded successfully!");
});

client.once('ready', () => {
    console.log(`🎵 Music Bot ${client.user.tag} is online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    const query = args.join(' ');

    if (!message.member.voice.channel) {
        return message.reply('🚫 Kamu harus berada di voice channel untuk menggunakan perintah musik!');
    }

    let queue = player.nodes.get(message.guild.id);
    if (!queue) {
        queue = player.nodes.create(message.guild, { metadata: message.channel });
    }

    if (command === 'play') {
        if (!query) return message.reply('❌ Masukkan judul lagu atau link!');

        try {
            await queue.connect(message.member.voice.channel);
            const searchResult = await player.search(query, { requestedBy: message.author });
            const track = searchResult.tracks[0];

            if (!track) return message.reply('🚫 Lagu tidak ditemukan!');

            queue.addTrack(track);
            if (!queue.isPlaying()) await queue.node.play();
            message.reply(`🎵 Menambahkan **${track.title}** ke dalam antrian!`);
        } catch (err) {
            console.error(err);
            message.reply('❌ Terjadi kesalahan saat mencoba memutar lagu.');
        }
    }

    if (command === 'skip') {
        if (!queue || !queue.isPlaying()) return message.reply('🚫 Tidak ada lagu yang sedang diputar!');
        queue.node.skip();
        message.reply('⏭️ Lagu dilewati!');
    }

    if (command === 'stop') {
        if (!queue || !queue.isPlaying()) return message.reply('🚫 Tidak ada lagu yang sedang diputar!');
        queue.delete();
        message.reply('⏹️ Pemutaran dihentikan dan bot keluar dari voice channel.');
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
