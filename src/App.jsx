import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FaFacebook, FaInstagram, FaChevronLeft, FaChevronRight, FaClock, FaPlus, FaTimes, FaImage, FaTrash, FaEdit, FaCheck, FaArrowLeft } from 'react-icons/fa6';
import Cropper from 'react-easy-crop';

// --- Constantes da API ---
const API_VERSION = 'v23.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// Função auxiliar para cortar a imagem
const getCroppedImg = (imageSrc, pixelCrop) => {
  const image = new Image();
  image.src = imageSrc;
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

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

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Canvas is empty');
        return reject(new Error('Canvas is empty'));
      }
      blob.name = `cropped-${Date.now()}.jpeg`;
      resolve(blob);
    }, 'image/jpeg');
  });
};


// --- Componente Principal App ---
export default function App() {
    const [accessToken, setAccessToken] = useState('EAASCiZBZBPmPgBPdVdZAEyAQZCNXABrYk5UdHHRqZCKChvRyVOf6mJEISDl1v6ZCOw9Q4mKxXWEUbr4SEVS0O3kVhy6sVq9Md1BLYcIK5mMQAax4XiB4AA6uiKj2FuSbrDPkzG1KR1Y9FTdfI2fvxeQczTnMwDXKR1TiQJBrAZAp9MV0wMh3ItZBWAfGUnAXkdrxHlE2kDXOhPFsCZBx1');
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
    const [posts, setPosts] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('month');
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
    const [isLoadingPosts, setIsLoadingPosts] = useState(false);
    const [error, setError] = useState('');
    const [modalPostGroup, setModalPostGroup] = useState(null);
    const [isPublisherOpen, setIsPublisherOpen] = useState(false);

    const fetchPostsAndAccounts = useCallback(async () => {
        if (accessToken) {
            await loadAccounts();
        }
    }, [accessToken]);

    useEffect(() => {
        fetchPostsAndAccounts();
    }, [fetchPostsAndAccounts]);

    useEffect(() => {
        if (selectedAccountIds.size > 0) {
            fetchAllPostsForSelectedAccounts();
        } else {
            setPosts([]);
        }
    }, [selectedAccountIds, currentDate, view]);
    
    const fetchPaginatedAPI = useCallback(async (endpoint, token) => {
        let allData = [];
        let url = `${BASE_URL}${endpoint}&access_token=${token || accessToken}`;
        try {
            while (url) {
                const response = await fetch(url);
                const pageData = await response.json();
                if (pageData.error) throw new Error(pageData.error.message);
                if (pageData.data) allData = allData.concat(pageData.data);
                url = pageData.paging?.next;
            }
            setError('');
            return allData;
        } catch (err) {
            console.error(`Erro na API paginada (${endpoint}):`, err);
            setError(`Erro na API: ${err.message}`);
            return [];
        }
    }, [accessToken]);

    const loadAccounts = useCallback(async () => {
        setIsLoadingAccounts(true);
        setError('');
        setAccounts([]);
        const fields = 'name,id,access_token,picture{url},instagram_business_account{name,username,id}';
        const endpoint = `/me/accounts?fields=${fields}`;
        const data = await fetchPaginatedAPI(endpoint, accessToken);
        if (data) setAccounts(data);
        setIsLoadingAccounts(false);
    }, [accessToken, fetchPaginatedAPI]);

    const fetchAllPostsForSelectedAccounts = useCallback(async () => {
        setIsLoadingPosts(true);
        setPosts([]);
        const range = getViewDateRange();
        const since = Math.floor(range.start.getTime() / 1000);
        const until = Math.floor(range.end.getTime() / 1000);

        const promises = Array.from(selectedAccountIds).map(async (accountId) => {
            const account = accounts.find(acc => acc.id === accountId);
            if (!account) return [];
            const pageAccessToken = account.access_token;
            let accountPosts = [];
            const fbFields = 'message,full_picture,permalink_url,created_time,is_published,scheduled_publish_time,attachments{media,subattachments}';
            const fbEndpoint = `/${accountId}/posts?fields=${fbFields}&since=${since}&until=${until}&limit=100`;
            const scheduledFbEndpoint = `/${accountId}/scheduled_posts?fields=${fbFields}&limit=100`;
            const [publishedFbData, scheduledFbData] = await Promise.all([
                fetchPaginatedAPI(fbEndpoint, pageAccessToken),
                fetchPaginatedAPI(scheduledFbEndpoint, pageAccessToken)
            ]);
            const publishedFbPosts = (publishedFbData || []).map(p => ({ ...p, platform: 'facebook', account }));
            const scheduledFbPosts = (scheduledFbData || []).map(p => ({ ...p, platform: 'facebook', account, is_scheduled: true }));
            accountPosts.push(...publishedFbPosts, ...scheduledFbPosts);
            if (account.instagram_business_account) {
                const igId = account.instagram_business_account.id;
                const igFields = 'caption,media_url,thumbnail_url,permalink,timestamp,media_type,children{media_url,thumbnail_url,media_type}';
                const igEndpoint = `/${igId}/media?fields=${igFields}&since=${since}&until=${until}&limit=100`;
                const igData = await fetchPaginatedAPI(igEndpoint, accessToken);
                if (igData) accountPosts.push(...igData.map(p => ({ ...p, platform: 'instagram', account })));
            }
            return accountPosts;
        });

        const results = await Promise.all(promises);
        setPosts(results.flat());
        setIsLoadingPosts(false);
    }, [accounts, selectedAccountIds, currentDate, view, fetchPaginatedAPI, accessToken]);

    const handleAccountSelectionChange = (accountId) => {
        setSelectedAccountIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountId)) newSet.delete(accountId);
            else newSet.add(accountId);
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedAccountIds.size === accounts.length) setSelectedAccountIds(new Set());
        else setSelectedAccountIds(new Set(accounts.map(acc => acc.id)));
    };

    const getViewDateRange = () => {
        const d = new Date(currentDate);
        if (view === 'month') {
            const start = new Date(d.getFullYear(), d.getMonth(), 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
            return { start, end };
        } else {
            const first = d.getDate() - d.getDay();
            const start = new Date(d.setDate(first));
            start.setHours(0, 0, 0, 0);
            const end = new Date(d.setDate(start.getDate() + 6));
            end.setHours(23, 59, 59, 999);
            return { start, end };
        }
    };

    const handleDateChange = (amount) => {
        const newDate = new Date(currentDate);
        if (view === 'month') newDate.setMonth(newDate.getMonth() + amount);
        else newDate.setDate(newDate.getDate() + (amount * 7));
        setCurrentDate(newDate);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto font-sans">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Calendário de Conteúdo</h1>
                    <p className="text-gray-600 mt-1">Visualize e agende os posts de suas contas.</p>
                </div>
                <button
                    onClick={() => setIsPublisherOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
                >
                    <FaPlus />
                    Criar Publicação
                </button>
            </header>
            
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Selecione os Clientes</h2>
                    {accounts.length > 0 && <button onClick={handleSelectAll} className="px-4 py-1 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">{selectedAccountIds.size === accounts.length ? 'Limpar Seleção' : 'Selecionar Todos'}</button>}
                </div>
                {isLoadingAccounts ? <div className="flex justify-center p-4"><Spinner /></div> : accounts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {accounts.map(acc => (
                            <label key={acc.id} className="flex items-center p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer">
                                <input type="checkbox" checked={selectedAccountIds.has(acc.id)} onChange={() => handleAccountSelectionChange(acc.id)} className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                <img src={acc.picture?.data?.url} alt={acc.name} className="h-8 w-8 rounded-full ml-3" />
                                <div className="ml-3 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{acc.name}</p>
                                    {acc.instagram_business_account && <p className="text-xs text-gray-500 truncate">@{acc.instagram_business_account.username}</p>}
                                </div>
                            </label>
                        ))}
                    </div>
                ) : <p className="text-gray-500">Nenhuma conta encontrada. Verifique seu token.</p>}
                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            </div>
            
            {selectedAccountIds.size > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <CalendarHeader currentDate={currentDate} view={view} onDateChange={handleDateChange} onViewChange={setView} onToday={() => setCurrentDate(new Date())} />
                    {isLoadingPosts ? <div className="flex justify-center items-center p-10"><Spinner size="lg" /></div> : <CalendarGrid posts={posts} currentDate={currentDate} view={view} onPostClick={setModalPostGroup} />}
                </div>
            )}
            
            {isPublisherOpen && <PostPublisher accounts={accounts} userAccessToken={accessToken} onClose={() => setIsPublisherOpen(false)} onPublishSuccess={fetchPostsAndAccounts} />}
            {modalPostGroup && <PostModal postGroup={modalPostGroup} onClose={() => setModalPostGroup(null)} />}
        </div>
    );
}

// --- Componente PostPublisher ---
const PostPublisher = ({ accounts, userAccessToken, onClose, onPublishSuccess }) => {
    const [selectedClients, setSelectedClients] = useState(new Set());
    const [placements, setPlacements] = useState({});
    const [text, setText] = useState('');
    const [files, setFiles] = useState([]);
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleWarning, setScheduleWarning] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState({ message: '', type: '' });
    const dragItem = React.useRef(null);
    const dragOverItem = React.useRef(null);
    const fileInputRef = useRef(null);

    // Estado para o Cropper
    const [croppingFile, setCroppingFile] = useState(null); // { id, url, file }
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [aspect, setAspect] = useState(1 / 1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    useEffect(() => {
        const now = new Date();
        const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const localTime = now.toTimeString().slice(0, 5);
        setScheduleDate(localDate);
        setScheduleTime(localTime);
    }, []);

    const validateScheduleTime = useCallback(() => {
        if (!isScheduling || !scheduleDate || !scheduleTime) {
            setScheduleWarning('');
            return true;
        }
        const scheduleDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
        const minDate = new Date(new Date().getTime() + 20 * 60000); // Agora + 20 minutos
        if (scheduleDateTime < minDate) {
            setScheduleWarning('Agendamento deve ser no mínimo 20 minutos no futuro.');
            return false;
        }
        setScheduleWarning('');
        return true;
    }, [scheduleDate, scheduleTime, isScheduling]);

    useEffect(() => {
        validateScheduleTime();
    }, [validateScheduleTime]);

    const handleFileDrop = (e) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length + droppedFiles.length > 10) {
            alert('Você pode adicionar no máximo 10 imagens.');
            return;
        }
        setFiles(prev => [...prev, ...droppedFiles.map(file => ({ file, id: Math.random(), url: URL.createObjectURL(file) }))]);
    };
    
    const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));

    const handleSort = () => {
        let _files = [...files];
        const draggedItemContent = _files.splice(dragItem.current, 1)[0];
        _files.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setFiles(_files);
    };

    const handleClientSelection = (accountId) => {
        const newSelection = new Set(selectedClients);
        const newPlacements = { ...placements };
        if (newSelection.has(accountId)) {
            newSelection.delete(accountId);
            delete newPlacements[accountId];
        } else {
            newSelection.add(accountId);
            newPlacements[accountId] = { facebook: 'feed', instagram: 'feed' };
        }
        setSelectedClients(newSelection);
        setPlacements(newPlacements);
    };

    const handlePlacementChange = (accountId, platform, placement) => {
        setPlacements(prev => ({
            ...prev,
            [accountId]: {
                ...prev[accountId],
                [platform]: placement,
            }
        }));
    };
    
    const onCropComplete = (croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const applyCrop = async () => {
        if (!croppedAreaPixels || !croppingFile) return;
        try {
            const croppedBlob = await getCroppedImg(croppingFile.url, croppedAreaPixels);
            const croppedFile = new File([croppedBlob], croppingFile.file.name, { type: 'image/jpeg' });
            
            setFiles(files.map(f => f.id === croppingFile.id ? { ...f, file: croppedFile, url: URL.createObjectURL(croppedFile) } : f));
            setCroppingFile(null);
        } catch (e) {
            console.error(e);
        }
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isScheduling && !validateScheduleTime()) {
             setSubmitStatus({ message: 'Verifique a data e hora do agendamento.', type: 'error' });
             return;
        }
        if (selectedClients.size === 0 || (!text && files.length === 0)) {
            setSubmitStatus({ message: 'Selecione um cliente e adicione conteúdo.', type: 'error' });
            return;
        }
        setIsSubmitting(true);
        setSubmitStatus({ message: '', type: '' });

        const formData = new FormData();
        const accountsToPost = accounts.filter(acc => selectedClients.has(acc.id));
        
        formData.append('text', text);
        formData.append('placements', JSON.stringify(placements));
        formData.append('accounts', JSON.stringify(accountsToPost));
        formData.append('userAccessToken', userAccessToken);

        if (isScheduling) {
            formData.append('scheduled_publish_time', new Date(`${scheduleDate}T${scheduleTime}`).toISOString());
        }
        files.forEach(fileObj => formData.append('files', fileObj.file));

        try {
            const response = await fetch('/api/publish', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Erro desconhecido.');
            setSubmitStatus({ message: 'Publicação enviada com sucesso!', type: 'success' });
            setTimeout(() => {
                onClose();
                onPublishSuccess();
            }, 1500);
        } catch (error) {
            setSubmitStatus({ message: `Falha no envio: ${error.message}`, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (croppingFile) {
        return (
            <div className="fixed inset-0 bg-black/80 z-50 flex flex-col p-4" onClick={() => setCroppingFile(null)}>
                <div className="relative w-full h-full max-w-4xl max-h-[80vh] mx-auto" onClick={e => e.stopPropagation()}>
                    <Cropper
                        image={croppingFile.url}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspect}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                    />
                </div>
                <div className="flex-shrink-0 p-4 bg-gray-800 flex items-center justify-center gap-6" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setCroppingFile(null)} className="flex items-center gap-2 text-white"><FaArrowLeft /> Voltar</button>
                    <div className="flex gap-2">
                        <button onClick={() => setAspect(1 / 1)} className={`px-3 py-1 rounded text-sm ${aspect === 1/1 ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-gray-200'}`}>Quadrado (1:1)</button>
                        <button onClick={() => setAspect(4 / 5)} className={`px-3 py-1 rounded text-sm ${aspect === 4/5 ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-gray-200'}`}>Vertical (4:5)</button>
                    </div>
                    <button onClick={applyCrop} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"><FaCheck /> Aplicar Corte</button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-50 rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Criar Nova Publicação</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><FaTimes /></button>
                </div>
                <form onSubmit={handleSubmit} className="flex-grow contents">
                    <div className="flex-grow p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
                        <div className="space-y-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">1. Selecione os clientes</label>
                                <div className="p-2 border rounded-md max-h-40 overflow-y-auto space-y-2">
                                    {accounts.map(acc => (
                                        <label key={acc.id} className="flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" onChange={() => handleClientSelection(acc.id)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            <img src={acc.picture?.data?.url} className="h-6 w-6 rounded-full mx-2" />
                                            <span className="text-sm">{acc.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">2. Legenda</label>
                                <textarea value={text} onChange={(e) => setText(e.target.value)} rows="6" className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="Digite a legenda aqui..."></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">3. Mídias (até 10 imagens)</label>
                                <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 block">
                                    <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileDrop({ preventDefault: () => {}, dataTransfer: { files: e.target.files } })} />
                                    <FaImage className="mx-auto h-10 w-10 text-gray-400" />
                                    <p className="mt-2 text-sm text-gray-600">Arraste e solte ou clique aqui para selecionar</p>
                                </label>
                                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                    {files.map((fileObj, index) => (
                                        <div key={fileObj.id} draggable onDragStart={() => dragItem.current = index} onDragEnter={() => dragOverItem.current = index} onDragEnd={handleSort} onDragOver={(e) => e.preventDefault()} className="relative group aspect-square cursor-grab">
                                            <span className="absolute top-1 left-1 z-10 bg-black/60 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{index + 1}</span>
                                            <img src={fileObj.url} className="h-full w-full object-cover rounded" />
                                            <button type="button" onClick={() => setCroppingFile(fileObj)} className="absolute bottom-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><FaEdit size={12} /></button>
                                            <button type="button" onClick={() => removeFile(fileObj.id)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><FaTrash size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-md border flex flex-col">
                            <h3 className="text-lg font-semibold mb-2 text-center">4. Configurações e Preview</h3>
                             <div className="space-y-4 overflow-y-auto">
                                 {Array.from(selectedClients).map(clientId => {
                                     const acc = accounts.find(a => a.id === clientId);
                                     return (
                                        <div key={clientId} className="p-3 border rounded-md">
                                            <div className="flex items-center mb-3">
                                                <img src={acc.picture?.data?.url} className="h-8 w-8 rounded-full mr-2"/>
                                                <span className="font-semibold">{acc.name}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Config Facebook */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2"><FaFacebook className="text-blue-600"/><span>Facebook</span></div>
                                                    <select value={placements[clientId]?.facebook} onChange={(e) => handlePlacementChange(clientId, 'facebook', e.target.value)} className="w-full text-sm p-2 border border-gray-300 rounded-md">
                                                        <option value="feed">Feed</option>
                                                        <option value="story" disabled>Story (em breve)</option>
                                                    </select>
                                                </div>
                                                {/* Config Instagram */}
                                                {acc.instagram_business_account && (
                                                    <div className="space-y-2">
                                                         <div className="flex items-center gap-2"><FaInstagram className="text-pink-600"/><span>Instagram</span></div>
                                                         <select value={placements[clientId]?.instagram} onChange={(e) => handlePlacementChange(clientId, 'instagram', e.target.value)} className="w-full text-sm p-2 border border-gray-300 rounded-md">
                                                            <option value="feed">Feed</option>
                                                            <option value="story" disabled>Story (em breve)</option>
                                                            <option value="reels" disabled>Reels (em breve)</option>
                                                         </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                     )
                                 })}

                                 <div className="p-3 border rounded-md">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input type="checkbox" checked={isScheduling} onChange={() => setIsScheduling(!isScheduling)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                        <span className="text-sm font-medium">Agendar publicação</span>
                                    </label>
                                    {isScheduling && (
                                        <div className="mt-2 grid grid-cols-2 gap-4 animate-fade-in">
                                            <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm" />
                                            <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm" />
                                            {scheduleWarning && <p className="col-span-2 text-xs text-red-600">{scheduleWarning}</p>}
                                        </div>
                                    )}
                                 </div>
                             </div>
                        </div>
                    </div>
                    <div className="p-4 bg-gray-100 border-t flex justify-between items-center">
                        <div>
                            {submitStatus.message && <p className={`text-sm ${submitStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{submitStatus.message}</p>}
                        </div>
                        <div className="flex gap-4">
                            <button type="submit" disabled={isSubmitting} className="px-6 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                                {isSubmitting ? 'Enviando...' : (isScheduling ? 'Agendar' : 'Publicar Agora')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Componentes Aninhados (Visualização do Calendário)
const CalendarHeader = ({ currentDate, view, onDateChange, onViewChange, onToday }) => {
    const headerText = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return (
        <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
            <div className="flex items-center space-x-2">
                <button onClick={() => onDateChange(-1)} className="p-2 rounded-full hover:bg-gray-200"><FaChevronLeft /></button>
                <h2 className="text-xl font-semibold w-40 text-center capitalize">{headerText}</h2>
                <button onClick={() => onDateChange(1)} className="p-2 rounded-full hover:bg-gray-200"><FaChevronRight /></button>
                <button onClick={onToday} className="px-4 py-1 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100">Hoje</button>
            </div>
            <div className="flex items-center rounded-md border border-gray-300">
                <button onClick={() => onViewChange('month')} className={`px-3 py-1 rounded-l-md text-sm ${view === 'month' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700'}`}>Mês</button>
                <button onClick={() => onViewChange('week')} className={`px-3 py-1 rounded-r-md text-sm ${view === 'week' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700'}`}>Semana</button>
            </div>
        </div>
    );
};

const CalendarGrid = ({ posts, currentDate, view, onPostClick }) => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    
    const calendarDays = useMemo(() => {
        const daysArray = [];
        const d = new Date(currentDate);
        if (view === 'month') {
            const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            const startDayOfWeek = firstDay.getDay();
            for (let i = 0; i < startDayOfWeek; i++) {
                const prevMonthDay = new Date(firstDay);
                prevMonthDay.setDate(prevMonthDay.getDate() - (startDayOfWeek - i));
                daysArray.push(prevMonthDay);
            }
            for (let i = 1; i <= lastDay.getDate(); i++) {
                daysArray.push(new Date(d.getFullYear(), d.getMonth(), i));
            }
            const lastDayOfWeek = lastDay.getDay();
            for (let i = 1; i < 7 - lastDayOfWeek; i++) {
                const nextMonthDay = new Date(lastDay);
                nextMonthDay.setDate(lastDay.getDate() + i);
                daysArray.push(nextMonthDay);
            }
        } else { // week
            const startOfWeek = new Date(d);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
            for (let i = 0; i < 7; i++) {
                const day = new Date(startOfWeek);
                day.setDate(day.getDate() + i);
                daysArray.push(day);
            }
        }
        return daysArray;
    }, [currentDate, view]);

    const getPostGroupsForDay = (date) => {
        const postsOnDay = posts.filter(post => {
            const postDate = new Date(post.timestamp || post.created_time || post.scheduled_publish_time);
            return postDate.toDateString() === date.toDateString();
        });

        const groupedByAccount = postsOnDay.reduce((acc, post) => {
            const accountId = post.account.id;
            if (!acc[accountId]) {
                acc[accountId] = [];
            }
            acc[accountId].push(post);
            return acc;
        }, {});

        return Object.values(groupedByAccount);
    };

    return (
        <>
            <div className="grid grid-cols-7 border-b-2 font-medium text-gray-600 text-sm">
                {days.map(day => <div key={day} className="text-center py-2">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 border-l border-t">
                {calendarDays.map(day => (
                    <DayCell key={day.toISOString()} day={day} postGroups={getPostGroupsForDay(day)} onPostClick={onPostClick} isCurrentMonth={day.getMonth() === currentDate.getMonth()} />
                ))}
            </div>
        </>
    );
};

const DayCell = ({ day, postGroups, onPostClick, isCurrentMonth }) => {
    const today = new Date();
    const isToday = day.toDateString() === today.toDateString();
    
    let cellClasses = 'p-2 border-r border-b relative min-h-[120px] flex flex-col transition-colors duration-200';
    if (!isCurrentMonth) cellClasses += ' bg-gray-50 text-gray-400';
    else cellClasses += ' bg-white';

    return (
        <div className={cellClasses}>
            <span className={`text-xs md:text-sm mb-1 self-start ${isToday ? 'bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold' : ''}`}>{day.getDate()}</span>
            <div className="mt-1 space-y-1 overflow-y-auto flex-grow">
                {postGroups.map(group => <ClientPostGroup key={group[0].account.id} postGroup={group} onPostClick={onPostClick} />)}
            </div>
        </div>
    );
};

const ClientPostGroup = ({ postGroup, onPostClick }) => {
    const account = postGroup[0].account;

    return (
        <div className="flex items-center text-xs p-1 rounded-md bg-gray-100 text-gray-800 cursor-pointer hover:bg-gray-200" onClick={() => onPostClick(postGroup)}>
            <img src={account.picture?.data?.url} alt={account.name} className="h-4 w-4 rounded-full mr-2 flex-shrink-0" />
            <span className="truncate flex-grow">{account.name}</span>
        </div>
    );
};

const PostModal = ({ postGroup, onClose }) => {
    const account = postGroup[0].account;
    const platforms = useMemo(() => Array.from(new Set(postGroup.map(p => p.platform))).sort(), [postGroup]);
    const [activeTab, setActiveTab] = useState(platforms[0] || null);

    const postsForTab = postGroup.filter(p => p.platform === activeTab);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-3">
                            <img src={account.picture?.data?.url} alt={account.name} className="h-10 w-10 rounded-full" />
                            <div>
                                <p className="font-semibold text-lg">{account.name}</p>
                                <p className="text-sm text-gray-500">Posts do dia: {new Date(postGroup[0].timestamp || postGroup[0].created_time || postGroup[0].scheduled_publish_time).toLocaleDateString('pt-BR')}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                    </div>
                </div>

                <div className="px-6 border-b border-gray-200">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        {platforms.map(platform => (
                            <button
                                key={platform}
                                onClick={() => setActiveTab(platform)}
                                className={`${activeTab === platform ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} capitalize flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                            >
                                {platform === 'facebook' ? <FaFacebook /> : <FaInstagram />}
                                {platform}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {postsForTab.length > 0 ? postsForTab.map(post => (
                        <PostDetails key={post.id} post={post} />
                    )) : <p className="text-gray-500 text-center py-8">Nenhum post para esta plataforma neste dia.</p>}
                </div>
            </div>
        </div>
    );
};

const PostDetails = ({ post }) => {
    const postDate = new Date(post.timestamp || post.created_time || post.scheduled_publish_time);
    const isScheduled = post.is_scheduled;

    let mediaHTML = null;
    const commonImgClass = "max-w-full rounded-md mt-2";
    const getMediaUrl = (item) => item.media_url || item.full_picture || item.media?.image?.src;

    if (post.platform === 'instagram' && post.children?.data.length > 0) {
        mediaHTML = post.children.data.map(child =>
            child.media_type === 'VIDEO' ?
            <video key={child.id} controls className={commonImgClass} src={child.media_url}></video> :
            <img key={child.id} src={child.media_url} className={commonImgClass} alt="Post media" />
        );
    } else if (post.platform === 'facebook' && post.attachments?.data[0]?.subattachments) {
        mediaHTML = post.attachments.data[0].subattachments.data.map(child =>
            <img key={child.target.id} src={child.media.image.src} className={commonImgClass} alt="Post media" />
        );
    } else {
        const mediaUrl = getMediaUrl(post) || (post.attachments?.data[0] ? getMediaUrl(post.attachments.data[0]) : null);
        if (mediaUrl) {
            mediaHTML = post.media_type === 'VIDEO' ?
            <video controls className={commonImgClass} src={mediaUrl}></video> :
            <img src={mediaUrl} className={commonImgClass} alt="Post media" />;
        }
    }

    return (
        <div className="border rounded-lg p-4">
            <p className="whitespace-pre-wrap text-gray-800 text-sm">{post.message || post.caption || <em>Post sem texto.</em>}</p>
            {mediaHTML && <div className="mt-4">{mediaHTML}</div>}
            
            <div className="mt-4 pt-4 border-t">
                {(post.permalink_url || post.permalink) && (
                    <div className="mb-3">
                        <a href={post.permalink_url || post.permalink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">
                            Ver no {post.platform === 'instagram' ? 'Instagram' : 'Facebook'} &rarr;
                        </a>
                    </div>
                )}
                <div className="text-xs text-gray-500 flex items-center gap-1">
                    <FaClock />
                    <span>
                        {isScheduled ? 'Agendado para: ' : 'Publicado em: '}
                        <strong>{postDate.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}</strong>
                    </span>
                </div>
            </div>
        </div>
    );
};

const Spinner = ({ size = 'md' }) => {
    const sizeClasses = {
        sm: 'h-5 w-5 border-2',
        md: 'h-8 w-8 border-4',
        lg: 'h-12 w-12 border-4'
    };
    return (
        <div className={`animate-spin rounded-full border-solid border-indigo-500 border-t-transparent ${sizeClasses[size] || sizeClasses['md']}`}></div>
    );
};