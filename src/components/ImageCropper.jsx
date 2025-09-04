// src/components/ImageCropper.jsx
import React, { useState } from 'react';
import Cropper from 'react-easy-crop';
import { FaArrowLeft, FaCheck } from 'react-icons/fa';

// Função auxiliar para cortar a imagem
const getCroppedImgBlob = (imageSrc, pixelCrop) => {
  const image = new Image();
  image.src = imageSrc;
  image.crossOrigin = 'anonymous'; // Essencial para carregar imagens de URLs de objeto
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

  return new Promise((resolve, reject) => {
    image.onload = () => {
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Canvas is empty');
          return reject(new Error('Canvas is empty'));
        }
        resolve(blob);
      }, 'image/jpeg');
    };
    image.onerror = (error) => reject(error);
  });
};

const ImageCropper = ({ fileToCrop, onCropComplete, onCancel }) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [aspect, setAspect] = useState(1 / 1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const handleCropComplete = (croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const applyCrop = async () => {
        if (!croppedAreaPixels || !fileToCrop) return;
        try {
            const croppedBlob = await getCroppedImgBlob(fileToCrop.url, croppedAreaPixels);
            onCropComplete(fileToCrop.id, croppedBlob);
        } catch (e) {
            console.error(e);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex flex-col p-4">
            <div className="relative w-full h-full max-w-4xl max-h-[80vh] mx-auto">
                <Cropper
                    image={fileToCrop.url}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspect}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={handleCropComplete}
                />
            </div>
            <div className="flex-shrink-0 p-4 bg-gray-800 flex items-center justify-center gap-6">
                <button onClick={onCancel} className="flex items-center gap-2 text-white"><FaArrowLeft /> Voltar</button>
                <div className="flex gap-2">
                    <button onClick={() => setAspect(1 / 1)} className={`px-3 py-1 rounded text-sm ${aspect === 1/1 ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-gray-200'}`}>Quadrado (1:1)</button>
                    <button onClick={() => setAspect(4 / 5)} className={`px-3 py-1 rounded text-sm ${aspect === 4/5 ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-gray-200'}`}>Vertical (4:5)</button>
                </div>
                <button onClick={applyCrop} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"><FaCheck /> Aplicar Corte</button>
            </div>
        </div>
    );
};

export default ImageCropper;