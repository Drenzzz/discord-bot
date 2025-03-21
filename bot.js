import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config(); // Load .env file

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// 📌 Daftar Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Menjawab pertanyaan dengan DeepSeek AI')
        .addStringOption(option =>
            option.setName('pertanyaan')
                .setDescription('Masukkan pertanyaanmu')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Cek latensi bot'),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Melihat jumlah pertanyaan yang telah dijawab'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Menampilkan daftar perintah bot')
].map(command => command.toJSON());

// 🚀 Bot Siap & Deploy Slash Commands
client.once('ready', async () => {
    client.application.commands.set([]);
    console.log(`🤖 Bot ${client.user.tag} is online!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        console.log('🔄 Mengupdate slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Slash commands berhasil didaftarkan!');
    } catch (error) {
        console.error('❌ Error saat mendaftarkan slash commands:', error);
    }
});

// 📊 Stats Counter
let statsCount = 0;

// 🔄 Handler untuk Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📜 Daftar Perintah')
            .setDescription(
                '`/ask [pertanyaan]` → Menjawab pertanyaan dengan DeepSeek AI\n' +
                '`/ping` → Cek latensi bot\n' +
                '`/stats` → Melihat jumlah pertanyaan yang telah dijawab\n' +
                '`/help` → Menampilkan daftar perintah'
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ping') {
        return interaction.reply(`🏓 Pong! Latency: ${client.ws.ping}ms`);
    }

    if (commandName === 'stats') {
        return interaction.reply(`📊 Bot telah menjawab ${statsCount} pertanyaan sejauh ini.`);
    }

    if (commandName === 'ask') {
        const userInput = interaction.options.getString('pertanyaan').trim();
        if (!userInput) {
            return interaction.reply({ content: '⚠️ Pertanyaan tidak boleh kosong!', ephemeral: true });
        }

        try {
            await interaction.deferReply();
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

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('💡 Jawaban dari AI')
                .setDescription(aiReply.substring(0, 4096)); // Batasan panjang embed

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ Error DeepSeek AI:', error);
            await interaction.editReply('🚨 Terjadi kesalahan saat memproses permintaan. Silakan coba lagi nanti.');
        }
    }
});

// 🔑 Login ke Bot Discord
client.login(process.env.DISCORD_BOT_TOKEN);
