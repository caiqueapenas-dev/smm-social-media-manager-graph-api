import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FaFacebook, FaInstagram, FaChevronLeft, FaChevronRight, FaClock, FaPlus, FaTimes, FaImage, FaTrash } from 'react-icons/fa';

// --- Constantes da API ---
const API_VERSION = 'v23.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// --- Componente Principal App ---
export default function App() {
    // ... (state variables remain the same)
    const [accessToken, setAccessToken] = useState('EAASCiZBZBPmPgBPeBo07xLUb2zucpHMYtKVPNsvGLUSODm0bvwEGySBj5SIwOtDOYMDh4pemtZAust9G9ZB8jDOHKlJmzhmZCnOOxjVRwv3KUdAaUOBOMM1LZAj6WosqU39fIxPPZAlQmCQ4He484x4ZCbaQij2nN2TdMig39eYZBiMsYzE2Ao0cDraZBOLzZA2mhNdxPLk2POnnSvZAZAa4jZCzKj4flYcQciuCRH4QZCkLm2TDYU2kZCS6oAZDZD');
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
    const [posts, setPosts] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('month');
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
    const [isLoadingPosts, setIsLoadingPosts] = useState(false);
    const [error, setError] = useState('');
    const [modalPostGroup, setModalPostGroup] = useState(null);
    
    // NOVO: Estado para controlar o modal de publicação
    const [isPublisherOpen, setIsPublisherOpen] = useState(false);

    // ... (useEffect hooks remain the same)
    useEffect(() => {
        if (accessToken) {
            loadAccounts();
        }
    }, [accessToken]);

    useEffect(() => {
        if (selectedAccountIds.size > 0) {
            fetchAllPostsForSelectedAccounts();
        } else {
            setPosts([]);
        }
    }, [selectedAccountIds, currentDate, view]);


    // ... (API and UI functions remain the same)
    const fetchPaginatedAPI = useCallback(async (endpoint, token) => {
        let allData = [];
        let url = `${BASE_URL}${endpoint}&access_token=${token || accessToken}`;

        try {
            while (url) {
                const response = await fetch(url);
                const pageData = await response.json();

                if (pageData.error) {
                    throw new Error(pageData.error.message);
                }

                if (pageData.data) {
                    allData = allData.concat(pageData.data);
                }

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


    const loadAccounts = async () => {
        setIsLoadingAccounts(true);
        setError('');
        setAccounts([]);
        
        const fields = 'name,id,access_token,picture{url},instagram_business_account{name,username}';
        const endpoint = `/me/accounts?fields=${fields}`;
        const data = await fetchPaginatedAPI(endpoint, accessToken);
        if (data) {
            setAccounts(data);
        }
        setIsLoadingAccounts(false);
    };

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
                if (igData) {
                    const igPosts = igData.map(p => ({ ...p, platform: 'instagram', account }));
                    accountPosts.push(...igPosts);
                }
            }
            return accountPosts;
        });

        const results = await Promise.all(promises);
        const allPosts = results.flat(); 
        setPosts(allPosts);
        setIsLoadingPosts(false);
    }, [accounts, selectedAccountIds, currentDate, view, fetchPaginatedAPI, accessToken]);
    
    const handleAccountSelectionChange = (accountId) => {
        setSelectedAccountIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountId)) {
                newSet.delete(accountId);
            } else {
                newSet.add(accountId);
            }
            return newSet;
        });
    };
    
    const handleSelectAll = () => {
        if (selectedAccountIds.size === accounts.length) {
            setSelectedAccountIds(new Set()); 
        } else {
            setSelectedAccountIds(new Set(accounts.map(acc => acc.id)));
        }
    };

    const getViewDateRange = () => {
        const d = new Date(currentDate);
        if (view === 'month') {
            const start = new Date(d.getFullYear(), d.getMonth(), 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
            return { start, end };
        } else { // week
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
        if (view === 'month') {
            newDate.setMonth(newDate.getMonth() + amount);
        } else {
            newDate.setDate(newDate.getDate() + (amount * 7));
        }
        setCurrentDate(newDate);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto font-sans">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Calendário de Conteúdo</h1>
                    <p className="text-gray-600 mt-1">Visualize e agende os posts de suas contas.</p>
                </div>
                {/* NOVO: Botão para abrir o publicador */}
                <button 
                    onClick={() => setIsPublisherOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
                >
                    <FaPlus />
                    Criar Publicação
                </button>
            </header>
            
            {/* ... (Rest of the component remains the same) ... */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Selecione os Clientes</h2>
                    {accounts.length > 0 && (
                        <button 
                            onClick={handleSelectAll}
                            className="px-4 py-1 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                        >
                           {selectedAccountIds.size === accounts.length ? 'Limpar Seleção' : 'Selecionar Todos'}
                        </button>
                    )}
                </div>

                {isLoadingAccounts ? <div className="flex justify-center p-4"><Spinner /></div> : 
                 accounts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {accounts.map(acc => (
                            <label key={acc.id} className="flex items-center p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedAccountIds.has(acc.id)}
                                    onChange={() => handleAccountSelectionChange(acc.id)}
                                    className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <img src={acc.picture?.data?.url} alt={acc.name} className="h-8 w-8 rounded-full ml-3" />
                                <div className="ml-3 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{acc.name}</p>
                                    {acc.instagram_business_account && (
                                        <p className="text-xs text-gray-500 truncate">@{acc.instagram_business_account.username}</p>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                ) : <p className="text-gray-500">Nenhuma conta encontrada. Verifique seu token.</p>
                }
                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            </div>
            
            {selectedAccountIds.size > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-md">
                   <CalendarHeader 
                        currentDate={currentDate}
                        view={view}
                        onDateChange={handleDateChange}
                        onViewChange={setView}
                        onToday={() => setCurrentDate(new Date())}
                   />
                    {isLoadingPosts ? (
                        <div className="flex justify-center items-center p-10"><Spinner size="lg" /></div>
                    ) : (
                        <CalendarGrid 
                            posts={posts} 
                            currentDate={currentDate} 
                            view={view} 
                            onPostClick={setModalPostGroup}
                        />
                    )}
                </div>
            )}

            {/* NOVO: Renderização do modal de publicação */}
            {isPublisherOpen && <PostPublisher accounts={accounts} onClose={() => setIsPublisherOpen(false)} />}
            
            {modalPostGroup && <PostModal postGroup={modalPostGroup} onClose={() => setModalPostGroup(null)} />}
        </div>
    );
}

// --- NOVO: Componente PostPublisher ---

const PostPublisher = ({ accounts, onClose }) => {
    const [selectedProfiles, setSelectedProfiles] = useState(new Set());
    const [text, setText] = useState('');
    const [files, setFiles] = useState([]);

    const handleFileDrop = (e) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles(prev => [...prev, ...droppedFiles]);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-gray-50 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Criar Nova Publicação</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><FaTimes /></button>
                </div>
                
                <div className="flex-grow p-4 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
                    {/* Coluna da Esquerda: Configurações */}
                    <div className="space-y-6">
                        {/* 1. Selecionar Perfis */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">1. Selecione os perfis</label>
                            <div className="p-2 border rounded-md max-h-40 overflow-y-auto space-y-2">
                                {accounts.map(acc => (
                                    <label key={acc.id} className="flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer">
                                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                        <img src={acc.picture?.data?.url} className="h-6 w-6 rounded-full mx-2" />
                                        <span className="text-sm">{acc.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* 2. Texto do post */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">2. Texto do post</label>
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                rows="8"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="Digite a legenda aqui..."
                            ></textarea>
                        </div>
                        
                        {/* 3. Mídias */}
                        <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">3. Mídias</label>
                             <div 
                                onDrop={handleFileDrop} 
                                onDragOver={(e) => e.preventDefault()}
                                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500"
                             >
                                <FaImage className="mx-auto h-10 w-10 text-gray-400" />
                                <p className="mt-2 text-sm text-gray-600">Arraste e solte as imagens aqui ou clique para selecionar</p>
                                <input type="file" multiple className="hidden" />
                             </div>
                             <div className="mt-4 grid grid-cols-3 gap-2">
                                 {files.map((file, index) => (
                                     <div key={index} className="relative group">
                                         <img src={URL.createObjectURL(file)} className="h-24 w-full object-cover rounded" />
                                         <button onClick={() => removeFile(index)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"><FaTrash size={12} /></button>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>

                    {/* Coluna da Direita: Preview */}
                    <div className="bg-white p-4 rounded-md border">
                         <h3 className="text-lg font-semibold mb-4 text-center">Preview</h3>
                         <div className="w-full max-w-sm mx-auto bg-gray-100 p-2 rounded-lg">
                             {/* Mockup do preview */}
                             <div className="flex items-center mb-2">
                                <div className="h-8 w-8 rounded-full bg-gray-300"></div>
                                <div className="ml-2 h-4 w-24 bg-gray-300 rounded"></div>
                             </div>
                             <div className="w-full h-64 bg-gray-300 rounded-md flex items-center justify-center">
                                {files.length > 0 ? <img src={URL.createObjectURL(files[0])} className="max-h-full max-w-full" /> : <FaImage className="h-16 w-16 text-gray-400" />}
                             </div>
                             <p className="mt-2 text-sm text-gray-700 p-2 whitespace-pre-wrap">{text || "Sua legenda aparecerá aqui..."}</p>
                         </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-100 border-t flex justify-end items-center gap-4">
                    <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-md">Salvar Rascunho</button>
                    <button className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Agendar</button>
                </div>
            </div>
        </div>
    );
};


// --- (Rest of the components: CalendarHeader, CalendarGrid, DayCell, etc. remain the same) ---
// ...
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

