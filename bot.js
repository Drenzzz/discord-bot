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

client.on('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} is online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const userInput = message.content;
    if (!userInput.startsWith(BOT_PREFIX)) return;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: userInput.slice(BOT_PREFIX.length) }]
            })
        });

        const data = await response.json();
        const aiReply = data.choices?.[0]?.message?.content || 'Maaf, tidak ada respons dari AI.';

        // Jika pesan lebih panjang dari 4096 karakter, potong agar tidak error di Embed
        const trimmedReply = aiReply.substring(0, 4096);

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('💡 Jawaban dari AI')
            .setDescription(trimmedReply);

        await message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ Error DeepSeek AI:', error);
        await message.reply('Terjadi kesalahan, coba lagi nanti.');
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
