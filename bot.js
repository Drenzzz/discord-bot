import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config(); // Load .env file

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const BOT_PREFIX = '!';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'; // Sesuaikan jika ada perubahan

client.once('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} is online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(BOT_PREFIX)) return;
    
    const userInput = message.content.slice(BOT_PREFIX.length); // Hapus prefix dari input user
    
    try {
        await message.channel.sendTyping(); // Memberi tanda bahwa bot sedang mengetik
        
        const startTime = Date.now(); // Simpan waktu sebelum request API
        
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: userInput }]
            })
        });

        const endTime = Date.now(); // Simpan waktu setelah menerima response
        console.log(`⏳ Waktu respons API: ${endTime - startTime} ms`);

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();
        const aiReply = data.choices?.[0]?.message?.content || 'Maaf, tidak ada respons dari AI.';

        // Jika lebih dari 4096 karakter, bagi menjadi beberapa Embed
        const MAX_EMBED_LENGTH = 4096;
        const messageChunks = aiReply.match(/.{1,4096}/gs) || [];

        for (let i = 0; i < messageChunks.length; i++) {
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(i === 0 ? '💡 Jawaban dari AI' : `🔹 Lanjutan (${i + 1})`)
                .setDescription(messageChunks[i]);

            await message.reply({ embeds: [embed] });
        }

    } catch (error) {
        console.error('❌ Error DeepSeek AI:', error);
        await message.reply('Terjadi kesalahan saat memproses permintaan. Coba lagi nanti.');
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
