// api/publish.js
// Esta é uma Serverless Function para a Vercel.
// Lembre-se de adicionar suas variáveis de ambiente (MONGODB_URI, CLOUDINARY_*) nas configurações do projeto na Vercel.

import { v2 as cloudinary } from 'cloudinary';
import { MongoClient } from 'mongodb';

// Configuração do Cloudinary com as variáveis de ambiente
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuração do MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Cache da conexão com o banco para reutilização
let db;

async function connectToDb() {
  if (db) return db;
  await client.connect();
  db = client.db('social-media-manager'); // Você pode nomear seu banco de dados aqui
  return db;
}

// --- Handler Principal ---
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const formData = await request.formData();
        const files = formData.getAll('files');
        const accountsToPost = JSON.parse(formData.get('accounts'));
        const caption = formData.get('caption');
        const publishMode = formData.get('publishMode'); // 'now' or 'schedule'
        const scheduleTimestamp = formData.get('scheduleTimestamp'); // UNIX timestamp

        if (!files.length || !accountsToPost.length) {
            return response.status(400).json({ error: 'É necessário fornecer imagens e selecionar ao menos uma conta.' });
        }

        // 1. Fazer upload das imagens para o Cloudinary
        const uploadPromises = files.map(async (file) => {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({ folder: 'social-media-manager' }, (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }).end(buffer);
            });
        });

        const uploadedImages = await Promise.all(uploadPromises);
        const imageUrls = uploadedImages.map(img => img.secure_url);

        // 2. Publicar/Agendar para cada conta selecionada
        const results = [];
        for (const account of accountsToPost) {
            // Lógica de publicação aqui (exemplo simplificado)
            // A implementação real faria chamadas para a Graph API da Meta
            // para criar contêineres e publicar.
            
            console.log(`-- Processando para: ${account.name} --`);
            console.log(`Caption: ${caption}`);
            console.log(`Imagens: ${imageUrls.join(', ')}`);
            if (publishMode === 'schedule') {
                console.log(`Agendado para: ${new Date(scheduleTimestamp * 1000).toLocaleString()}`);

                // Se for Instagram, salvar no MongoDB
                if (account.isInstagram) {
                    const database = await connectToDb();
                    const scheduledPostsCollection = database.collection('scheduled_posts');
                    await scheduledPostsCollection.insertOne({
                        accountId: account.id,
                        accountName: account.name,
                        platform: 'instagram',
                        caption: caption,
                        mediaUrls: imageUrls,
                        scheduledAt: new Date(scheduleTimestamp * 1000),
                        status: 'scheduled',
                    });
                     console.log('Post do Instagram salvo no MongoDB para agendamento.');
                }
            }
             results.push({ accountName: account.name, status: 'success' });
        }


        response.status(200).json({ 
            status: 'sucesso', 
            message: 'Publicações processadas. A lógica de chamada da API da Meta ainda é um placeholder.',
            results,
        });

    } catch (error) {
        console.error('Erro no backend:', error);
        response.status(500).json({ error: 'Ocorreu um erro no servidor.', details: error.message });
    }
}

