// src/components/PostModal.jsx
import React, { useState, useMemo } from 'react';
import { FaFacebook, FaInstagram, FaClock, FaTimes } from 'react-icons/fa';

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
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl"><FaTimes /></button>
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

export default PostModal;