import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';

// Load .env file
config();

// Validasi konfigurasi
if (!process.env.DISCORD_BOT_TOKEN || !process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CSE_ID) {
    console.error('❌ Token atau API Key tidak ditemukan di file .env');
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

const GOOGLE_SEARCH_API = 'https://www.googleapis.com/customsearch/v1';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

const searchResultsCache = new Map();

const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const BASE_URL = `https://api.exchangerate.host`;

const API_KEY_WEATHER = process.env.OPENWEATHER_API_KEY;
const WEATHER_URL = `https://api.openweathermap.org/data/2.5/weather`;

const userLastGachaWaifu = new Map();

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
        ),
    new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Menerjemahkan teks')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Teks yang ingin diterjemahkan')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Bahasa tujuan (contoh: en, id, es, fr)')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('search')
        .setDescription('Mencari informasi di Google')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Kata kunci pencarian')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('convert-currency')
        .setDescription('Konversi mata uang berdasarkan nilai tukar terbaru.')
        .addStringOption(option => 
            option.setName('from')
                .setDescription('Kode mata uang asal (contoh: USD) , wajib 3 huruf besar')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('to')
                .setDescription('Kode mata uang tujuan (contoh: IDR , wajib 3 huruf besar)')
                .setRequired(true))
        .addNumberOption(option => 
            option.setName('amount')
                .setDescription('Jumlah yang ingin dikonversi')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Menampilkan informasi cuaca terkini berdasarkan kota')
        .addStringOption(option =>
            option.setName('city')
                .setDescription('Nama kota yang ingin dicek cuacanya')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('qr-gen')
        .setDescription('Menghasilkan QR Code dari teks atau URL')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Teks atau URL yang ingin dijadikan QR Code')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('gachawaifu')
        .setDescription('Dapatkan waifu acak dari AniList'),
    new SlashCommandBuilder()
        .setName('findwaifu')
        .setDescription('Cari waifu berdasarkan nama')
        .addStringOption(option => 
            option.setName('nama')
            .setDescription('Nama waifu yang dicari')
            .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('klaimwaifu')
        .setDescription('Klaim waifu terakhir yang di-gacha'),
    new SlashCommandBuilder()
        .setName('topwaifu')
        .setDescription('Lihat peringkat user dengan waifu terbanyak')
            

].map(command => command.toJSON());

// 📊 Stats Counter
let statsCount = 0;
let summarizeCount = 0;
let lastGachaWaifu = null;

const db = new sqlite3.Database('./databases/waifu.db');
db.run(`
    CREATE TABLE IF NOT EXISTS user_waifus (
        user_id TEXT,
        waifu_id INTEGER,
        waifu_name TEXT,
        waifu_image TEXT,
        claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

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

async function googleSearch(query, page = 1) {
    const start = (page - 1) * 10 + 1; // Google uses 1-based indexing
    // Add num=10 parameter to request maximum results per page
    const url = `${GOOGLE_SEARCH_API}?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&start=${start}&num=10`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Google Search API Error: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        return data.items || [];
    } catch (error) {
        console.error('Error fetching search results:', error);
        return [];
    }
}

// Create a separate function for building pagination buttons
function createPaginationButtons(userId, currentPage, resultsCount) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`prev_${userId}`)
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage <= 1),
            new ButtonBuilder()
                .setCustomId(`next_${userId}`)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(resultsCount < 10) // If less than 10 results, probably no more pages
        );
}

// Update sendSearchResults to use the new button creator
async function sendSearchResults(interaction, query, results, page, isUpdate = false) {
    const embed = new EmbedBuilder()
        .setTitle(`🔍 Hasil Pencarian: ${query}`)
        .setColor(0x3498db)
        .setFooter({ text: `Halaman ${page}` })
        .setTimestamp();
    
    // Add each result to the embed
    results.forEach((result, index) => {
        embed.addFields({
            name: `${index + 1}. ${result.title}`,
            value: `[Buka](${result.link})\n${result.snippet || 'Tidak ada deskripsi'}`
        });
    });

    const buttons = createPaginationButtons(interaction.user.id, page, results.length);

    if (isUpdate) {
        await interaction.update({ embeds: [embed], components: [buttons] });
    } else {
        await interaction.reply({ embeds: [embed], components: [buttons] });
    }
}

async function fetchRandomWaifu() {
    const query = `
        query {
            Page(page: 1, perPage: 50) {
                characters(sort: FAVOURITES_DESC) {
                    id
                    name {
                        full
                    }
                    image {
                        large
                    }
                    favourites
                }
            }
        }
    `;

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        const data = await response.json();
        const characters = data.data.Page.characters;

        // Tambahkan randomisasi dengan memilih karakter secara acak
        const randomCharacter = characters[Math.floor(Math.random() * characters.length)];
        
        return {
            id: randomCharacter.id,
            name: randomCharacter.name.full,
            image: randomCharacter.image.large,
            favourites: randomCharacter.favourites
        };
    } catch (error) {
        console.error('Error fetching waifu:', error);
        return null;
    }
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
        if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

        const { commandName } = interaction;
        console.log(`📝 Command dijalankan: ${commandName} oleh ${interaction.user.tag}`);

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('📜 Daftar Perintah')
                .setDescription(
                    '`/ask [pertanyaan]` → Menjawab pertanyaan dengan DeepSeek AI\n' +
                    '`/summarize [text]` → Meringkas teks panjang\n' +
                    '`/translate  [text] [languange]` → Menerjemahkan bahasa ke bahasa lain\n' +
                    '`/search [text]` → Cari sesuatu informasi di Google\n' +
                    '`/convert-currency [from] [to] [amount]` → Mengonversi mata uang berdasarkan kurs terkini\n' +
                    '`/weather [city]` → Menampilkan informasi cuaca terkini\n' + 
                    '`/qr-gen [url/text]` → Menghasilkan QR Code dari teks atau URL yang diberikan\n' + 
                    '`/gachawaifu` → Mendapatkan waifu acak dari database AniList\n' +
                    '`/findwaifu [nama]` → Mencari waifu berdasarkan nama karakter\n' +
                    '`/klaimwaifu` → Menyimpan waifu favorit ke dalam koleksi pribadi\n' +
                    '`/topwaifu` → Melihat ranking user dengan koleksi waifu terbanyak\n' +
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

        if (commandName === 'translate') {
            const text = interaction.options.getString('text');
            const language = interaction.options.getString('language');
    
            if (!text.trim()) {
                return await interaction.reply({ content: '⚠️ Teks tidak boleh kosong!', ephemeral: true });
            }
    
            await interaction.deferReply();
    
            try {
                const response = await fetch(DEEPSEEK_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            { role: 'user', content: `Terjemahkan teks ini ke bahasa ${language}: "${text}"` }
                        ]
                    })
                });
    
                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                const data = await response.json();
                const translation = data.choices[0].message?.content || 'Terjemahan tidak tersedia.';
    
                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('🌍 Terjemahan')
                    .setDescription(translation.substring(0, 4096));
    
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('❌ Error saat menerjemahkan:', error);
                await interaction.editReply({ content: '🚨 Terjadi kesalahan saat menerjemahkan.' });
            }
        }
        
        if (commandName === 'search') {
            const query = interaction.options.getString('query');
            const results = await googleSearch(query);
            if (results.length === 0) {
                return interaction.reply({ content: '❌ Tidak ada hasil ditemukan.', ephemeral: true });
            }
    
            searchResultsCache.set(interaction.user.id, { query, page: 1, results });
            await sendSearchResults(interaction, query, results, 1);
        }
    
        if (interaction.isButton()) {
            const [action, userId] = interaction.customId.split('_');
            
            // Check if this button belongs to the user
            if (userId !== interaction.user.id) {
                return interaction.reply({ 
                    content: '❌ Ini bukan hasil pencarianmu!', 
                    ephemeral: true 
                });
            }
            
            // Get search data from cache
            const searchData = searchResultsCache.get(userId);
            if (!searchData) {
                return interaction.reply({ 
                    content: '❌ Data pencarian tidak ditemukan atau telah kedaluwarsa!', 
                    ephemeral: true 
                });
            }
            
            // Update page based on button action
            let newPage = searchData.page;
            if (action === 'next') {
                newPage++;
            } else if (action === 'prev' && newPage > 1) {
                newPage--;
            }
            
            // Only fetch new results if page actually changed
            if (newPage !== searchData.page) {
                console.log(`Changing page from ${searchData.page} to ${newPage}`);
                const newResults = await googleSearch(searchData.query, newPage);
                
                // Update cache
                searchResultsCache.set(userId, {
                    query: searchData.query,
                    page: newPage,
                    results: newResults,
                    timestamp: Date.now()
                });
                
                // Send updated results
                await sendSearchResults(interaction, searchData.query, newResults, newPage, true);
            } else {
                // If no page change (e.g., trying to go back from page 1), just acknowledge
                await interaction.update({ components: [createPaginationButtons(userId, newPage, searchData.results.length)] });
            }
            
            return; // Exit early for button interactions
        }

        if (commandName === 'convert-currency') {
            const from = interaction.options.getString('from').toUpperCase();
            const to = interaction.options.getString('to').toUpperCase();
            const amount = interaction.options.getNumber('amount');
        
            try {
                await interaction.deferReply();
        
                // Gunakan access_key di request
                const response = await fetch(`${BASE_URL}/convert?from=${from}&to=${to}&amount=${amount}&access_key=${API_KEY}`);
                const data = await response.json();
        
                console.log("API Response:", data); // Debugging log
        
                if (!data.success) {
                    return interaction.editReply(`❌ Error: ${data.error.info}`);
                }
        
                const converted = data.result.toFixed(2);
                await interaction.editReply(`💱 **${amount} ${from}** = **${converted} ${to}**`);
            } catch (error) {
                console.error("API Fetch Error:", error);
                await interaction.editReply('⚠️ Terjadi kesalahan saat mengambil data mata uang.');
            }
        }

        if (commandName === 'weather') {
            const city = interaction.options.getString('city');
            
            if (!city) {
                return interaction.reply('❌ Harap masukkan nama kota yang valid.');
            }
    
            try {
                await interaction.deferReply(); // Memberi tanda bahwa bot sedang memproses
    
                const response = await fetch(`${WEATHER_URL}?q=${city}&appid=${API_KEY_WEATHER}&units=metric&lang=id`);
                const data = await response.json();
    
                if (data.cod !== 200) {
                    return interaction.editReply(`❌ Kota tidak ditemukan atau terjadi kesalahan.`);
                }
    
                const weatherDesc = data.weather[0].description;
                const temp = data.main.temp;
                const feelsLike = data.main.feels_like;
                const humidity = data.main.humidity;
                const windSpeed = data.wind.speed;
    
                await interaction.editReply(`🌤 **Cuaca di ${city}**:
🌡 Suhu: **${temp}°C** (Terasa seperti **${feelsLike}°C**)
💧 Kelembaban: **${humidity}%**
🌬 Kecepatan Angin: **${windSpeed} m/s**
📖 Deskripsi: **${weatherDesc}**`);
                
            } catch (error) {
                console.error(error);
                await interaction.editReply('⚠️ Terjadi kesalahan saat mengambil data cuaca.');
            }
        }

        if (commandName === 'qr-gen') {
            const text = interaction.options.getString('text');
        
            if (!text.trim()) {
                return interaction.reply({ content: '❌ Teks tidak boleh kosong!', ephemeral: true });
            }
        
            await interaction.deferReply();
        
            try {
                const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=300&format=png`;
        
                // Fetch QR Code sebagai buffer
                const response = await fetch(qrUrl);
                const buffer = await response.arrayBuffer();
        
                // Kirim QR Code sebagai attachment
                const attachment = new AttachmentBuilder(Buffer.from(buffer), { name: 'qrcode.png' });
        
                const embed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('📌 QR Code Generated')
                    .setDescription(`QR Code untuk teks: ${text}`)
                    .setFooter({ text: 'Dibuat dengan QuickChart API' })
                    .setImage('attachment://qrcode.png'); // Gambar dari attachment
        
                await interaction.editReply({ embeds: [embed], files: [attachment] });
            } catch (error) {
                console.error('❌ Error saat membuat QR Code:', error);
                await interaction.editReply('⚠️ Terjadi kesalahan saat membuat QR Code.');
            }
        }
                
        if (commandName === 'gachawaifu') {
            await interaction.deferReply();
            const waifu = await fetchRandomWaifu();
        
            if (!waifu) {
                return interaction.editReply('Gagal mendapatkan waifu. Coba lagi nanti.');
            }
        
            // Simpan waifu untuk user spesifik
            userLastGachaWaifu.set(interaction.user.id, waifu);
        
            const embed = new EmbedBuilder()
                .setTitle(`Waifu Baru: ${waifu.name}`)
                .setImage(waifu.image)
                .addFields(
                    { name: 'Favourites', value: waifu.favourites.toString(), inline: true }
                )
                .setFooter({ text: 'Gunakan /klaimwaifu untuk menyimpan waifu ini' });
        
            await interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'findwaifu') {
            const namaWaifu = interaction.options.getString('nama');
            await interaction.deferReply();
        
            const query = `
                query {
                    Character(search: "${namaWaifu}") {
                        id
                        name {
                            full
                        }
                        image {
                            large
                        }
                        description(asHtml: false)
                    }
                }
            `;
        
            try {
                const response = await fetch('https://graphql.anilist.co', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ query })
                });
        
                const data = await response.json();
                const character = data.data.Character;
        
                if (!character) {
                    return interaction.editReply(`Waifu dengan nama "${namaWaifu}" tidak ditemukan.`);
                }
        
                const embed = new EmbedBuilder()
                    .setTitle(character.name.full)
                    .setImage(character.image.large)
                    .setDescription(character.description ? character.description.substring(0, 1000) : 'Tidak ada deskripsi')
                    .addFields(
                        { name: 'ID', value: character.id.toString(), inline: true }
                    );
        
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('Error mencari waifu:', error);
                await interaction.editReply('Terjadi kesalahan saat mencari waifu.');
            }
        }
        
        if (commandName === 'klaimwaifu') {
            const lastWaifu = userLastGachaWaifu.get(interaction.user.id);
            
            if (!lastWaifu) {
                return interaction.reply('Kamu belum mendapatkan waifu. Gunakan /gachawaifu terlebih dahulu.');
            }

            const userId = interaction.user.id;

            db.run(`
                INSERT INTO user_waifus (user_id, waifu_id, waifu_name, waifu_image) 
                VALUES (?, ?, ?, ?)
            `, [userId, lastWaifu.id, lastWaifu.name, lastWaifu.image], (err) => {
                if (err) {
                    console.error('Error menyimpan waifu:', err);
                    return interaction.reply('Gagal menyimpan waifu. Mungkin waifu sudah pernah diklaim.');
                }

                // Hapus waifu dari map setelah diklaim
                userLastGachaWaifu.delete(interaction.user.id);

                const embed = new EmbedBuilder()
                    .setTitle('Waifu Berhasil Diklaim!')
                    .setDescription(`Selamat! Kamu berhasil mengklaim ${lastWaifu.name}`)
                    .setImage(lastWaifu.image);

                interaction.reply({ embeds: [embed] });
            });
        }
        
        if (commandName === 'topwaifu') {
            db.all(`
                SELECT user_id, COUNT(*) as waifu_count 
                FROM user_waifus 
                GROUP BY user_id 
                ORDER BY waifu_count DESC 
                LIMIT 10
            `, async (err, rows) => {
                if (err) {
                    console.error('Error mendapatkan top waifu:', err);
                    return interaction.reply('Terjadi kesalahan saat mengambil data.');
                }
        
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Top Waifu Collectors')
                    .setColor(0x3498db);
        
                if (rows.length === 0) {
                    embed.setDescription('Belum ada waifu yang diklaim.');
                } else {
                    const leaderboard = await Promise.all(rows.map(async (row, index) => {
                        const user = await client.users.fetch(row.user_id);
                        return `${index + 1}. ${user.username}: ${row.waifu_count} waifu`;
                    }));
        
                    embed.setDescription(leaderboard.join('\n'));
                }
        
                interaction.reply({ embeds: [embed] });
            });
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