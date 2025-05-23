import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { Mail, Send, Paperclip, User, LogOut, Loader2, Bell, Search, Archive, Star, Reply, Forward, Trash2, MoreHorizontal } from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [notification, setNotification] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Check authentication status
  const checkAuthStatus = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/gmail/status', { withCredentials: true });
      console.log('Auth status:', response.data);
      return response.data.authenticated;
    } catch (error) {
      console.error('Error checking auth status:', error);
      return false;
    }
  };

  // Handle authentication redirect
  const handleAuthRedirect = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/gmail/auth');
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Error getting auth URL:', error);
      setError('Failed to initialize authentication');
    }
  };

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:5000/api/messages', { withCredentials: true });
      const newThreads = response.data || [];
      console.log('Fetched threads:', newThreads);
      
      if (threads.length > 0) {
        const newThread = newThreads.find((thread, idx) => idx === 0 && thread.id !== threads[0]?.id);
        if (newThread) {
          setNotification(`New message from ${newThread.from}`);
          setTimeout(() => setNotification(''), 5000);
        }
      }
      
      setThreads(newThreads);
      setError('');
    } catch (error) {
      console.error('Error fetching threads:', error);
      
      if (error.response?.status === 401 || error.response?.data?.needsReauth) {
        localStorage.removeItem('gmailAuthenticated');
        handleAuthRedirect();
      } else {
        setError('Failed to load conversations. Please try again.');
        setTimeout(() => setError(''), 5000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('auth') === 'success') {
        localStorage.setItem('gmailAuthenticated', 'true');
        window.history.replaceState({}, document.title, '/dashboard');
      }

      const isAuthenticated = await checkAuthStatus();
      setAuthChecked(true);
      
      if (isAuthenticated) {
        localStorage.setItem('gmailAuthenticated', 'true');
        await fetchThreads();
        const interval = setInterval(fetchThreads, 30000);
        return () => clearInterval(interval);
      } else {
        localStorage.removeItem('gmailAuthenticated');
        handleAuthRedirect();
      }
    };

    initializeApp();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('gmailAuthenticated');
    axios.post('http://localhost:5000/api/auth/logout', {}, { withCredentials: true })
      .then(() => navigate('/login'))
      .catch(() => navigate('/login'));
  };

  const handleReply = async () => {
    if (!selectedThread || !replyText) {
      setError('Please select a conversation and enter a reply.');
      setTimeout(() => setError(''), 5000);
      return;
    }

    try {
      const latestMessageId = selectedThread.messages[selectedThread.messages.length - 1].id;
      const response = await axios.post(
        'http://localhost:5000/api/reply',
        { messageId: latestMessageId, replyText },
        { withCredentials: true }
      );
      
      if (response.data.success) {
        setNotification('Reply sent successfully!');
        setTimeout(() => setNotification(''), 5000);
        setReplyText('');
        
        setSelectedThread((prev) => ({
          ...prev,
          messages: [...prev.messages, response.data.newMessage],
        }));
        
        setThreads((prevThreads) =>
          prevThreads.map((thread) =>
            thread.id === selectedThread.id
              ? { ...thread, messages: [...thread.messages, response.data.newMessage] }
              : thread
          )
        );
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      
      if (error.response?.status === 401 || error.response?.data?.needsReauth) {
        localStorage.removeItem('gmailAuthenticated');
        handleAuthRedirect();
      } else {
        setError(error.response?.data?.error || 'Failed to send reply.');
        setTimeout(() => setError(''), 5000);
      }
    }
  };

  const renderAttachment = (attachment, index) => {
    const { filename, mimeType, data, contentId } = attachment;
    
    if (!data) {
      console.warn(`No data for attachment ${filename} (index: ${index})`);
      return (
        <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-sm" key={index}>
          <div className="flex items-center space-x-2">
            <Paperclip className="w-4 h-4" />
            <span>Failed to load attachment: {filename}</span>
          </div>
        </div>
      );
    }

    let base64Data = data;
    if (base64Data && !base64Data.includes('data:')) {
      base64Data = base64Data.replace(/\s/g, '');
      while (base64Data.length % 4) {
        base64Data += '=';
      }
    }

    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    console.log(`Rendering attachment: ${filename}, MIME: ${mimeType}, Content-ID: ${contentId}`);

    if (mimeType.startsWith('image/')) {
      return (
        <div className="mt-4 group" key={index}>
          <div className="relative overflow-hidden rounded-xl shadow-md bg-gray-50 p-2">
            <img
              src={dataUrl}
              alt={filename}
              className="max-w-full h-auto rounded-lg transition-transform duration-300 group-hover:scale-[1.02]"
              onError={(e) => {
                console.error(`Failed to render image: ${filename}`, e);
                e.target.style.display = 'none';
              }}
              onLoad={() => console.log(`Successfully loaded image: ${filename}`)}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2 flex items-center">
            <Paperclip className="w-3 h-3 mr-1" />
            {filename}
          </p>
        </div>
      );
    } else if (mimeType.startsWith('video/')) {
      return (
        <div className="mt-4" key={index}>
          <div className="relative overflow-hidden rounded-xl shadow-md bg-gray-50 p-2">
            <video
              controls
              className="max-w-full h-auto rounded-lg"
              onError={(e) => {
                console.error(`Failed to render video: ${filename}`, e);
                e.target.style.display = 'none';
              }}
            >
              <source src={dataUrl} type={mimeType} />
              Your browser does not support the video tag.
            </video>
          </div>
          <p className="text-sm text-gray-500 mt-2 flex items-center">
            <Paperclip className="w-3 h-3 mr-1" />
            {filename}
          </p>
        </div>
      );
    } else {
      return (
        <div className="mt-3" key={index}>
          <a
            href={dataUrl}
            download={filename}
            className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-all duration-200 group"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3">
              <Paperclip className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-700 group-hover:text-gray-900">{filename}</div>
              <div className="text-xs text-gray-500">
                {mimeType === 'application/pdf' ? 'PDF Document' : 'File'}
              </div>
            </div>
          </a>
        </div>
      );
    }
  };

  const renderMessageBody = (body, mimeType) => {
    if (!body) {
      return <div className="text-gray-400 italic">No content available</div>;
    }
    
    if (mimeType === 'text/html') {
      const sanitizedHtml = DOMPurify.sanitize(body, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'img', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class'],
      });
      return (
        <div
          className="prose prose-gray max-w-none text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      );
    }
    
    return <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">{body}</div>;
  };

  const filteredThreads = threads.filter(thread => 
    !searchQuery || 
    thread.from?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-100">
        <div className="text-center p-8 rounded-2xl bg-white/95 shadow-xl border border-gray-100">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium text-lg">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-indigo-100 font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-white/95 shadow-xl flex flex-col border-r border-gray-100">
        <div className="p-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Inbox</h1>
              <p className="text-indigo-100 text-sm">Your Email</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-indigo-200" />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-indigo-200/50 rounded-lg text-white placeholder-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all duration-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mr-2" />
              <span className="text-gray-500">Loading emails...</span>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="text-center text-gray-500 p-8">
              <Mail className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No emails found.</p>
            </div>
          ) : (
            <div className="p-3">
              {filteredThreads.map((thread, index) => (
                <div
                  key={thread.id}
                  className={`p-4 m-2 rounded-lg cursor-pointer transition-all duration-300 hover:bg-indigo-50/50 ${
                    selectedThread?.id === thread.id 
                      ? 'bg-indigo-100/80 shadow-md' 
                      : 'bg-white/50'
                  }`}
                  onClick={() => setSelectedThread(thread)}
                  style={{ 
                    animation: 'fadeIn 0.5s ease-out',
                    animationDelay: `${index * 50}ms`,
                    animationFillMode: 'forwards'
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white bg-gradient-to-br from-indigo-500 to-purple-500 shadow-sm`}>
                      {thread.from?.charAt(0)?.toUpperCase() || <User className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{thread.from || 'Unknown'}</div>
                      <div className="text-sm text-gray-500 truncate">{thread.subject || 'No Subject'}</div>
                    </div>
                    <div className="text-xs text-gray-400">4m</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="p-6 bg-white/95 shadow-md border-b border-gray-100">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-800">Your Conversations</h1>
                <p className="text-gray-500 text-sm">Manage your emails seamlessly</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {notification && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Bell className="w-4 h-4" />
                  <span className="text-sm">{notification}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-all duration-300 shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg shadow-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {selectedThread ? (
            <div className="max-w-3xl mx-auto px-6 py-8">
              <div className="mb-6 p-6 bg-white/95 rounded-xl shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">
                    {selectedThread.subject || 'No Subject'}
                  </h2>
                  <div className="flex items-center space-x-2">
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
                      <Archive className="w-4 h-4 text-gray-500" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
                      <Star className="w-4 h-4 text-gray-500" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
                      <MoreHorizontal className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>
                <div className="text-gray-600 text-sm">
                  {selectedThread.messages?.length || 0} messages
                </div>
              </div>

              {selectedThread.messages?.map((message, index) => (
                <div
                  key={message.id}
                  className={`mb-6 transition-all duration-500 ${
                    message.from.includes('me') ? 'ml-12' : 'mr-12'
                  }`}
                  style={{ 
                    animation: 'slideIn 0.5s ease-out',
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: 'forwards'
                  }}
                >
                  <div className={`p-6 rounded-xl shadow-md border ${
                    message.from.includes('me')
                      ? 'bg-indigo-600 text-white border-indigo-200'
                      : 'bg-white/95 border-gray-100'
                  }`}>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white ${
                          message.from.includes('me')
                            ? 'bg-white/20'
                            : 'bg-indigo-500'
                        }`}>
                          {message.from?.charAt(0)?.toUpperCase() || <User className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className={`font-medium ${
                            message.from.includes('me') ? 'text-white' : 'text-gray-800'
                          }`}>
                            {message.from || 'Unknown'}
                          </div>
                          <div className={`text-sm ${
                            message.from.includes('me') ? 'text-indigo-100' : 'text-gray-500'
                          }`}>
                            {message.date ? new Date(message.date).toLocaleString() : 'Unknown date'}
                          </div>
                        </div>
                      </div>
                      {!message.from.includes('me') && (
                        <div className="flex items-center space-x-1">
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
                            <Reply className="w-4 h-4 text-gray-500" />
                          </button>
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
                            <Forward className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mb-4">
                      {renderMessageBody(message.body, message.mimeType)}
                    </div>
                    {message.attachments?.length > 0 && (
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className={`text-sm font-medium mb-3 flex items-center ${
                          message.from.includes('me') ? 'text-indigo-100' : 'text-gray-600'
                        }`}>
                          <Paperclip className="w-4 h-4 mr-2" />
                          Attachments ({message.attachments.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {message.attachments.map((attachment, attachIndex) => (
                            <div key={attachIndex}>{renderAttachment(attachment, attachIndex)}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )) || (
                <div className="text-center text-gray-500 mt-20">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">No messages in this conversation.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600">Select an email</h3>
                <p className="text-gray-500">Choose an email from the sidebar</p>
              </div>
            </div>
          )}
        </div>

        {selectedThread && (
          <div className="p-6 bg-white/95 border-t border-gray-100 shadow-md">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply..."
                    className="w-full pl-4 pr-12 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all duration-300 text-gray-700 bg-white/80 shadow-sm"
                    onKeyPress={(e) => e.key === 'Enter' && handleReply()}
                  />
                  <button
                    onClick={handleReply}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-300 flex items-center justify-center shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;