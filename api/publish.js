// api/publish.js
// Esta é uma Serverless Function para a Vercel, agora com lógica para upload.
import { formidable } from 'formidable';
import { v2 as cloudinary } from 'cloudinary';

// Configuração do Cloudinary (puxe das variáveis de ambiente na Vercel)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper para desativar o parser padrão do Next.js/Vercel
export const config = {
  api: {
    bodyParser: false,
  },
};

// Função principal que lida com a requisição
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const form = formidable({});
    const [fields, files] = await form.parse(request);
    
    // Extrai os campos de texto do formulário
    const text = fields.text?.[0];
    const platformsToPost = JSON.parse(fields.platforms?.[0] || '[]');
    const scheduledPublishTime = fields.scheduled_publish_time?.[0];

    // Lógica de Upload para o Cloudinary
    const uploadedImageUrls = await Promise.all(
      (files.files || []).map(file => 
        cloudinary.uploader.upload(file.filepath).then(result => result.secure_url)
      )
    );

    if (uploadedImageUrls.length === 0 && !text) {
        return response.status(400).json({ error: 'É necessário ter um texto ou pelo menos uma imagem.' });
    }

    // AQUI ENTRARÁ A LÓGICA PARA PUBLICAR NA META API
    // Por enquanto, vamos retornar sucesso para testar o upload.

    console.log('Dados recebidos pelo backend:');
    console.log('Texto:', text);
    console.log('Plataformas:', platformsToPost);
    console.log('Agendado para:', scheduledPublishTime);
    console.log('URLs das imagens no Cloudinary:', uploadedImageUrls);

    // Exemplo de resposta de sucesso
    response.status(200).json({
      status: 'sucesso',
      message: 'Arquivos recebidos e enviados para o Cloudinary! Lógica de publicação da Meta a ser implementada.',
      cloudinaryUrls: uploadedImageUrls,
    });

  } catch (error) {
    console.error('Erro no backend:', error);
    response.status(500).json({ error: 'Ocorreu um erro no servidor.', details: error.message });
  }
}