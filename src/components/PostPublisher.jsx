import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FaFacebook, FaInstagram, FaTimes, FaImage, FaTrash, FaEdit, FaSearch, FaChevronRight } from 'react-icons/fa';
import ImageCropper from './ImageCropper';

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
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);
    const fileInputRef = useRef(null);
    const [croppingFile, setCroppingFile] = useState(null);

    const isStoryOnly = useMemo(() => {
        if (selectedClients.size === 0) return false;
        return Array.from(selectedClients).every(clientId => {
            const clientPlacements = placements[clientId] || {};
            const fbPlacement = clientPlacements.facebook;
            const igPlacement = clientPlacements.instagram;
            if (!fbPlacement && !igPlacement) return false;
            if (fbPlacement && fbPlacement !== 'story') return false;
            if (igPlacement && igPlacement !== 'story') return false;
            return true;
        });
    }, [placements, selectedClients]);

    useEffect(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 25);
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
        const minDate = new Date(new Date().getTime() + 20 * 60000);
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
        const account = accounts.find(a => a.id === accountId);
        
        if (newSelection.has(accountId)) {
            newSelection.delete(accountId);
            delete newPlacements[accountId];
        } else {
            newSelection.add(accountId);
            newPlacements[accountId] = { 
                ...(account.id && { facebook: 'feed' }), 
                ...(account.instagram_business_account && { instagram: 'feed' }) 
            };
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
    
    const handleCropComplete = (fileId, croppedBlob) => {
        const croppedFile = new File([croppedBlob], `cropped-${fileId}.jpg`, { type: 'image/jpeg' });
        setFiles(files.map(f => f.id === fileId ? { ...f, file: croppedFile, url: URL.createObjectURL(croppedFile) } : f));
        setCroppingFile(null);
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
        
        formData.append('text', isStoryOnly ? '' : text);
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
        return <ImageCropper fileToCrop={croppingFile} onCropComplete={handleCropComplete} onCancel={() => setCroppingFile(null)} />
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
                            <CollapsibleClientSelector accounts={accounts} selectedClients={selectedClients} onSelectionChange={handleClientSelection} />
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Legenda</label>
                                <textarea value={text} onChange={(e) => setText(e.target.value)} rows="6" disabled={isStoryOnly} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-200" placeholder={isStoryOnly ? 'Legendas não são aplicáveis para Stories' : 'Digite a legenda aqui...'}></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mídias (até 10 imagens)</label>
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
                            <h3 className="text-lg font-semibold mb-2 text-center">Configurações e Preview</h3>
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
                                                        <option value="story">Story</option>
                                                     </select>
                                                </div>
                                                {/* Config Instagram */}
                                                {acc.instagram_business_account && (
                                                    <div className="space-y-2">
                                                         <div className="flex items-center gap-2"><FaInstagram className="text-pink-600"/><span>Instagram</span></div>
                                                         <select value={placements[clientId]?.instagram} onChange={(e) => handlePlacementChange(clientId, 'instagram', e.target.value)} className="w-full text-sm p-2 border border-gray-300 rounded-md">
                                                            <option value="feed">Feed</option>
                                                            <option value="story">Story</option>
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

const CollapsibleClientSelector = ({ accounts, selectedClients, onSelectionChange }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const sortedAccounts = useMemo(() => 
        [...accounts].sort((a,b) => a.name.localeCompare(b.name)), 
    [accounts]);
    
    const filteredAccounts = useMemo(() => 
        sortedAccounts.filter(acc => acc.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [sortedAccounts, searchTerm]);

    return (
        <div className="bg-white rounded-lg shadow-md">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4">
                <h2 className="text-lg font-semibold text-gray-800">Selecione os Clientes</h2>
                <FaChevronRight className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
                <div className="p-4 border-t">
                    <div className="mb-4 relative">
                        <FaSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full p-2 pl-10 border rounded-md"
                        />
                    </div>
                    {filteredAccounts.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-60 overflow-y-auto">
                            {filteredAccounts.map(acc => (
                                <label key={acc.id} className="flex items-center p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer">
                                    <input type="checkbox" checked={selectedClients.has(acc.id)} onChange={() => onSelectionChange(acc.id)} className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <img src={acc.picture?.data?.url} alt={acc.name} className="h-8 w-8 rounded-full ml-3" />
                                    <div className="ml-3 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{acc.name}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default PostPublisher;