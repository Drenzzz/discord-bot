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
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
let statsCount = 0;

client.once('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} is online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const isMentioned = message.mentions.has(client.user);
    const isCommand = message.content.startsWith(BOT_PREFIX);
    
    if (!isCommand && !isMentioned) return;
    
    const userInput = isCommand
        ? message.content.slice(BOT_PREFIX.length) // Hapus prefix jika menggunakan '!'
        : message.content.replace(`<@${client.user.id}>`, '').trim(); // Hapus mention jika bot dipanggil

    if (userInput.toLowerCase() === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📜 Daftar Perintah')
            .setDescription(
                '`!ask [pertanyaan]` → Menjawab pertanyaan dengan DeepSeek AI\n' +
                '`!ping` → Cek latensi bot\n' +
                '`!stats` → Melihat jumlah pertanyaan yang telah dijawab\n' +
                '`@bot [pertanyaan]` → Auto-reply tanpa prefix'
            );
        return message.reply({ embeds: [embed] });
    }
    
    if (userInput.toLowerCase() === 'ping') {
        return message.reply(`🏓 Pong! Latency: ${client.ws.ping}ms`);
    }
    
    if (userInput.toLowerCase() === 'stats') {
        return message.reply(`📊 Bot telah menjawab ${statsCount} pertanyaan sejauh ini.`);
    }
    
    try {
        await message.channel.sendTyping();
        const startTime = Date.now();
        
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

        const endTime = Date.now();
        console.log(`⏳ Waktu respons API: ${endTime - startTime} ms`);

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();
        console.log('🔍 Response dari API DeepSeek:', JSON.stringify(data, null, 2));
        
        if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw new Error('DeepSeek API mengembalikan respons kosong atau tidak valid.');
        }
        
        const aiReply = data.choices[0].message?.content || 'Maaf, tidak ada respons dari AI.';
        statsCount++;

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
