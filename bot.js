import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load .env file
config();

// Validasi konfigurasi
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN tidak ditemukan di file .env');
    process.exit(1);
}

if (!process.env.DEEPSEEK_API_KEY) {
    console.error('❌ DEEPSEEK_API_KEY tidak ditemukan di file .env');
    process.exit(1);
}

// Membuat client dengan intents yang diperlukan
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Global error handler
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

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
        .setDescription('Menampilkan daftar perintah bot'),
    // Menambahkan perintah summarize baru
    new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Meringkas teks panjang dengan DeepSeek AI')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Teks yang ingin diringkas')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('length')
                .setDescription('Panjang ringkasan yang diinginkan')
                .setRequired(false)
                .addChoices(
                    { name: 'Pendek', value: 'short' },
                    { name: 'Sedang', value: 'medium' },
                    { name: 'Panjang', value: 'long' }
                )
        )
].map(command => command.toJSON());

// 📊 Stats Counter
let statsCount = 0;
let summarizeCount = 0;

// Fungsi untuk memanggil DeepSeek API
async function callDeepSeekAPI(messages) {
    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: messages
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ DeepSeek API Error (${response.status}):`, errorText);
        throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('DeepSeek API mengembalikan respons kosong atau tidak valid.');
    }

    return data.choices[0].message?.content || 'Maaf, tidak ada respons dari AI.';
}

// 🚀 Bot Siap & Deploy Slash Commands
client.once('ready', async () => {
    console.log(`🤖 Bot ${client.user.tag} is online!`);

    try {
        console.log('🔄 Mengupdate slash commands...');
        
        // Membuat REST instance untuk mendaftarkan commands
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
        
        // Mendaftarkan commands secara global (bisa memakan waktu hingga 1 jam untuk diterapkan)
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('✅ Slash commands berhasil didaftarkan secara global!');
        
        // Jika Anda ingin mendaftarkan commands ke server tertentu saja (lebih cepat diterapkan)
        /*
        const TEST_GUILD_ID = 'YOUR_GUILD_ID'; // Ganti dengan ID server Anda
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, TEST_GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash commands berhasil didaftarkan ke server tertentu!');
        */
    } catch (error) {
        console.error('❌ Error saat mendaftarkan slash commands:', error);
    }
});

// 🔄 Handler untuk Slash Commands
client.on('interactionCreate', async interaction => {
    try {
        // Hanya proses command interaksi
        if (!interaction.isChatInputCommand()) return;

        const { commandName } = interaction;
        console.log(`📝 Command dijalankan: ${commandName} oleh ${interaction.user.tag}`);

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('📜 Daftar Perintah')
                .setDescription(
                    '`/ask [pertanyaan]` → Menjawab pertanyaan dengan DeepSeek AI\n' +
                    '`/summarize [text]` → Meringkas teks panjang\n' +
                    '`/ping` → Cek latensi bot\n' +
                    '`/stats` → Melihat jumlah pertanyaan yang telah dijawab\n' +
                    '`/help` → Menampilkan daftar perintah\n'
                );
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'ping') {
            return await interaction.reply(`🏓 Pong! Latency: ${client.ws.ping}ms`);
        }

        if (commandName === 'stats') {
            return await interaction.reply(`📊 Bot telah menjawab ${statsCount} pertanyaan dan membuat ${summarizeCount} ringkasan sejauh ini.`);
        }

        if (commandName === 'ask') {
            const userInput = interaction.options.getString('pertanyaan');
            
            if (!userInput || userInput.trim() === '') {
                return await interaction.reply({ 
                    content: '⚠️ Pertanyaan tidak boleh kosong!', 
                    ephemeral: true 
                });
            }

            // Beri tahu pengguna bahwa bot sedang memproses
            await interaction.deferReply();
            console.log(`💬 Pertanyaan diterima: "${userInput}"`);
            
            try {
                const startTime = Date.now();

                // Persiapkan pesan untuk DeepSeek API
                const messages = [
                    { role: 'user', content: userInput }
                ];

                // Panggil API DeepSeek
                const aiReply = await callDeepSeekAPI(messages);
                
                const endTime = Date.now();
                console.log(`⏳ Waktu respons API: ${endTime - startTime} ms`);

                statsCount++;

                // Kirim jawaban sebagai embed
                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('💡 Jawaban dari AI')
                    .setDescription(aiReply.substring(0, 4096)); // Batasan panjang embed

                await interaction.editReply({ embeds: [embed] });
                console.log('✅ Jawaban berhasil dikirim');
            } catch (error) {
                console.error('❌ Error DeepSeek AI:', error);
                await interaction.editReply({ 
                    content: '🚨 Terjadi kesalahan saat memproses permintaan. Silakan coba lagi nanti.'
                });
            }
        }

        // Handler untuk perintah summarize
        if (commandName === 'summarize') {
            const textToSummarize = interaction.options.getString('text');
            const length = interaction.options.getString('length') || 'medium';
            
            if (!textToSummarize || textToSummarize.trim() === '') {
                return await interaction.reply({ 
                    content: '⚠️ Teks yang ingin diringkas tidak boleh kosong!', 
                    ephemeral: true 
                });
            }

            // Beri tahu pengguna bahwa bot sedang memproses
            await interaction.deferReply();
            console.log(`📝 Permintaan ringkasan diterima, panjang ${textToSummarize.length} karakter`);
            
            try {
                const startTime = Date.now();

                // Buat prompt yang spesifik berdasarkan panjang yang diminta
                let promptText = '';
                
                if (length === 'short') {
                    promptText = `Ringkas teks berikut menjadi 2-3 kalimat pendek, fokus pada poin utama saja:\n\n${textToSummarize}`;
                } else if (length === 'long') {
                    promptText = `Buatkan ringkasan komprehensif dari teks berikut, pertahankan detail penting dan ide-ide kunci (maksimum 30% dari panjang aslinya):\n\n${textToSummarize}`;
                } else { // medium (default)
                    promptText = `Ringkas teks berikut secara padat dan jelas, fokus pada poin-poin utama saja (maksimum 20% dari panjang aslinya):\n\n${textToSummarize}`;
                }

                // Persiapkan pesan untuk DeepSeek API
                const messages = [
                    { role: 'system', content: 'Kamu adalah asisten yang ahli dalam meringkas teks. Buatlah ringkasan yang jelas, akurat, dan mudah dipahami.' },
                    { role: 'user', content: promptText }
                ];

                // Panggil API DeepSeek
                const summary = await callDeepSeekAPI(messages);
                
                const endTime = Date.now();
                console.log(`⏳ Waktu respons API: ${endTime - startTime} ms`);

                summarizeCount++;

                // Kirim ringkasan sebagai embed
                const embed = new EmbedBuilder()
                    .setColor(0x4CAF50)
                    .setTitle('📖 Ringkasan')
                    .setDescription(summary.substring(0, 4096)) // Batasan panjang embed
                    .setFooter({ 
                        text: `Ringkasan ${length} • ${textToSummarize.length} karakter → ${summary.length} karakter`
                    });

                await interaction.editReply({ embeds: [embed] });
                console.log('✅ Ringkasan berhasil dikirim');
            } catch (error) {
                console.error('❌ Error DeepSeek AI Summarize:', error);
                await interaction.editReply({ 
                    content: '🚨 Terjadi kesalahan saat membuat ringkasan. Silakan coba lagi nanti.'
                });
            }
        }
    } catch (error) {
        console.error('❌ Error umum pada interaksi:', error);
        // Coba kirim pesan error jika interaksi belum direspons
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('🚨 Terjadi kesalahan tak terduga. Silakan coba lagi nanti.');
            } else {
                await interaction.reply({
                    content: '🚨 Terjadi kesalahan tak terduga. Silakan coba lagi nanti.',
                    ephemeral: true
                });
            }
        } catch (followUpError) {
            console.error('❌ Gagal mengirim pesan error:', followUpError);
        }
    }
});

// Logging saat bot terhubung/terputus
client.on('disconnect', event => {
    console.log('🔌 Bot terputus dari Discord:', event);
});

client.on('reconnecting', () => {
    console.log('🔄 Bot mencoba terhubung kembali...');
});

// 🔑 Login ke Bot Discord
console.log('🔑 Mencoba login ke Discord...');
client.login(process.env.DISCORD_BOT_TOKEN)
    .then(() => console.log('✅ Login berhasil!'))
    .catch(error => {
        console.error('❌ Gagal login ke Discord:', error);
        process.exit(1);
    });