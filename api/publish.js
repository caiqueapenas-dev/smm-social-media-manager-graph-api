// api/publish.js
import { formidable } from 'formidable';
import { v2 as cloudinary } from 'cloudinary';
import { MongoClient } from 'mongodb';

// --- Configurações ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const config = { api: { bodyParser: false } };
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'social-media-manager';

// --- Função Principal ---
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  let client;
  try {
    const form = formidable({ multiples: true });
    const [fields, files] = await form.parse(request);
    
    // Extrai os dados do formulário
    const text = fields.text?.[0] || '';
    const placements = JSON.parse(fields.placements?.[0] || '{}');
    const scheduledPublishTime = fields.scheduled_publish_time?.[0];
    const userAccessToken = fields.userAccessToken?.[0];
    const accountsToPost = JSON.parse(fields.accounts?.[0] || '[]');
    const imageFiles = files.files || [];
    
    // Faz o upload das imagens para o Cloudinary
    const uploadedImageUrls = await Promise.all(
      imageFiles.map(file => cloudinary.uploader.upload(file.filepath).then(result => result.secure_url))
    );

    if (uploadedImageUrls.length === 0 && !text) {
      throw new Error('É necessário ter um texto ou pelo menos uma imagem.');
    }
    
    if (MONGODB_URI) {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
    }
    
    // Processa a publicação para cada conta selecionada
    const results = await Promise.all(
      accountsToPost.map(account => publishToAccount(account, placements[account.id], text, uploadedImageUrls, scheduledPublishTime, userAccessToken, client))
    );

    response.status(200).json({ status: 'sucesso', results });

  } catch (error) {
    console.error('Erro no backend:', error);
    response.status(500).json({ error: 'Ocorreu um erro no servidor.', details: error.message });
  } finally {
      if (client) await client.close();
  }
}

// --- Funções de Publicação ---
async function publishToAccount(account, placements, text, imageUrls, scheduledTime, userAccessToken, dbClient) {
    const results = {};
    const unixTimestamp = scheduledTime ? Math.floor(new Date(scheduledTime).getTime() / 1000) : null;
    
    // --- Lógica para Facebook ---
    const fbPlacement = placements.facebook;
    if (fbPlacement) {
        try {
            switch(fbPlacement) {
                case 'feed':
                    if (imageUrls.length === 0) { // Apenas texto
                        await apiPost(`${account.id}/feed`, { message: text, ...(unixTimestamp && { published: false, scheduled_publish_time: unixTimestamp }) }, account.accessToken);
                    } else if (imageUrls.length === 1) { // Foto única
                        await apiPost(`${account.id}/photos`, { caption: text, url: imageUrls[0], ...(unixTimestamp && { published: false, scheduled_publish_time: unixTimestamp }) }, account.accessToken);
                    } else { // Carrossel
                        const attachedMedia = await Promise.all(
                            imageUrls.map(url => apiPost(`${account.id}/photos`, { url, published: false }, account.accessToken).then(res => ({ media_fbid: res.id })))
                        );
                        await apiPost(`${account.id}/feed`, { message: text, attached_media: attachedMedia, ...(unixTimestamp && { published: false, scheduled_publish_time: unixTimestamp }) }, account.accessToken);
                    }
                    break;
                case 'story':
                    // Para Stories, apenas uma imagem é permitida pela API
                    if (imageUrls.length > 0) {
                        await apiPost(`${account.id}/stories`, { page_photo_source: imageUrls[0] }, account.accessToken);
                    }
                    break;
            }
             results.facebook = { success: true, placement: fbPlacement };
        } catch (e) { results.facebook = { success: false, error: e.message, placement: fbPlacement }; }
    }

    // --- Lógica para Instagram ---
    const igPlacement = placements.instagram;
    const igAccount = account.instagram_business_account;
    if (igPlacement && igAccount) {
        const igUserId = igAccount.id;
        try {
            let creationId;
            switch(igPlacement) {
                case 'feed':
                     if (imageUrls.length === 1) { // Foto única
                        const container = await apiPost(`${igUserId}/media`, { image_url: imageUrls[0], caption: text, ...(unixTimestamp && { scheduled_publish_time: unixTimestamp }) }, userAccessToken);
                        creationId = container.id;
                    } else if (imageUrls.length > 1) { // Carrossel
                        const itemContainers = await Promise.all(
                            imageUrls.map(url => apiPost(`${igUserId}/media`, { image_url: url, is_carousel_item: true }, userAccessToken))
                        );
                        const carouselContainer = await apiPost(`${igUserId}/media`, { media_type: 'CAROUSEL', caption: text, children: itemContainers.map(c => c.id), ...(unixTimestamp && { scheduled_publish_time: unixTimestamp }) }, userAccessToken);
                        creationId = carouselContainer.id;
                    }
                    break;
                case 'story':
                     if (imageUrls.length > 0) {
                         const container = await apiPost(`${igUserId}/media`, { image_url: imageUrls[0], media_type: 'STORIES' }, userAccessToken);
                         creationId = container.id;
                     }
                    break;
            }
            
            if (creationId && !unixTimestamp) { // Publica imediatamente
                await apiPost(`${igUserId}/media_publish`, { creation_id: creationId }, userAccessToken);
            } else if (creationId && unixTimestamp && dbClient) {
                // Salva o post agendado do Instagram no nosso DB
                const db = dbClient.db(DB_NAME);
                await db.collection('scheduled_instagram_posts').insertOne({
                    accountId: igUserId,
                    creationId,
                    caption: text,
                    mediaUrls: imageUrls,
                    scheduledAt: new Date(scheduledTime),
                    status: 'SCHEDULED'
                });
            }
            results.instagram = { success: true, placement: igPlacement };
        } catch (e) { results.instagram = { success: false, error: e.message, placement: igPlacement }; }
    }
    return { accountName: account.name, ...results };
}

// Helper para chamadas à API da Meta
async function apiPost(endpoint, params, token) {
  const usp = new URLSearchParams();
  for (const key in params) {
      if (Array.isArray(params[key])) {
          usp.append(key, JSON.stringify(params[key]));
      } else {
          usp.append(key, params[key]);
      }
  }
  
  const response = await fetch(`https://graph.facebook.com/v23.0/${endpoint}?access_token=${token}`, {
    method: 'POST',
    body: usp,
  });
  const data = await response.json();
  if (data.error) throw new Error(`(${data.error.code}) ${data.error.message}`);
  return data;
}