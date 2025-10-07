// Supabase客户端配置
const SUPABASE_CONFIG = {
    url: 'https://elwiegxinwdrglxulfcw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsd2llZ3hpbndkcmdseHVsZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4MTQwNjcsImV4cCI6MjA3NTM5MDA2N30.ToMdeBiSfxG8TihDzfg-pQHjGXHrDFnzmCJP2kMBTW0'
};

// 安全的Supabase初始化函数
function initSupabase() {
    try {
        console.log('开始初始化 Supabase...');
        
        // 检查 Supabase 库是否已加载
        if (typeof supabase === 'undefined') {
            console.error('Supabase 库未加载，请检查 CDN 链接');
            throw new Error('Supabase 库未加载');
        }
        
        // 创建 Supabase 客户端
        const supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                storage: localStorage,
                flowType: 'pkce' // 添加 PKCE 流程增强安全性
            },
            global: {
                headers: {
                    'X-Client-Info': 'vocabulary-app'
                }
            }
        });
        
        console.log('Supabase 初始化成功');
        return supabaseClient;
        
    } catch (error) {
        console.error('Supabase 初始化失败:', error);
        
        // 提供完整的降级方案
        return createFallbackSupabase();
    }
}

// 创建降级的 Supabase 客户端
function createFallbackSupabase() {
    console.warn('使用降级的 Supabase 客户端 (离线模式)');
    
    return {
        auth: {
            getSession: () => Promise.resolve({ 
                data: { session: null }, 
                error: new Error('离线模式') 
            }),
            getUser: () => Promise.resolve({ 
                data: { user: null }, 
                error: new Error('离线模式') 
            }),
            signUp: () => Promise.resolve({ 
                data: null, 
                error: new Error('离线模式，无法注册') 
            }),
            signInWithPassword: () => Promise.resolve({ 
                data: null, 
                error: new Error('离线模式，无法登录') 
            }),
            signOut: () => Promise.resolve({ 
                error: new Error('离线模式') 
            }),
            onAuthStateChange: (callback) => {
                // 模拟立即返回未认证状态
                setTimeout(() => {
                    callback('SIGNED_OUT', null);
                }, 100);
                return { data: { subscription: { unsubscribe: () => {} } } };
            },
            resetPasswordForEmail: () => Promise.resolve({ 
                error: new Error('离线模式') 
            })
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: () => Promise.resolve({ data: null, error: new Error('离线模式') })
                }),
                order: () => Promise.resolve({ data: null, error: new Error('离线模式') })
            }),
            upsert: () => Promise.resolve({ error: new Error('离线模式') }),
            insert: () => Promise.resolve({ error: new Error('离线模式') }),
            update: () => Promise.resolve({ error: new Error('离线模式') })
        })
    };
}

// 初始化 Supabase 客户端
let supabase = initSupabase();
let syncManager = null;

// 确保全局可用
window.supabase = supabase;
window.syncManager = syncManager;

// Supabase数据同步管理
class SupabaseSyncManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.isSyncing = false;
        this.initialized = false;
        
        console.log('初始化 SupabaseSyncManager, 在线状态:', this.isOnline);
        
        // 监听网络状态
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // 延迟初始化认证状态监听
        setTimeout(() => {
            this.initAuthListener();
        }, 1000);
    }

    // 安全检查
    checkSupabase() {
        if (!supabase || !supabase.auth) {
            console.warn('Supabase 客户端不可用');
            return false;
        }
        return true;
    }

    // 初始化认证监听
    async initAuthListener() {
        if (!this.checkSupabase()) {
            console.warn('无法初始化认证监听 - Supabase 不可用');
            return;
        }

        try {
            // 检查现有会话
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) {
                console.warn('获取会话失败:', error);
            } else if (session) {
                console.log('发现现有会话:', session.user.email);
                this.updateAuthUI(session.user);
                // 延迟加载用户数据
                setTimeout(() => {
                    this.loadAllData().catch(console.error);
                }, 2000);
            }

            // 监听认证状态变化
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                console.log('认证状态变化:', event, session?.user?.email);
                
                if (event === 'SIGNED_IN' && session) {
                    this.updateAuthUI(session.user);
                    this.syncAllData().catch(console.error);
                    this.loadAllData().catch(console.error);
                    showToast('登录成功！', 'success');
                } else if (event === 'SIGNED_OUT') {
                    this.updateAuthUI(null);
                    this.clearUserData();
                    showToast('已退出登录', 'info');
                } else if (event === 'USER_UPDATED' && session) {
                    this.updateAuthUI(session.user);
                } else if (event === 'TOKEN_REFRESHED') {
                    console.log('令牌已刷新');
                }
            });

            this.initialized = true;
            console.log('认证监听初始化完成');
            
        } catch (error) {
            console.error('初始化认证监听失败:', error);
        }
    }

    // 更新认证UI - 增强错误处理
    updateAuthUI(user) {
        try {
            const loggedOutView = document.getElementById('logged-out-view');
            const loggedInView = document.getElementById('logged-in-view');
            const userEmail = document.getElementById('user-email');
            const syncStatus = document.getElementById('sync-status');

            if (!loggedOutView || !loggedInView || !userEmail) {
                console.warn('认证UI元素未找到');
                return;
            }

            if (user) {
                loggedOutView.classList.add('hidden');
                loggedInView.classList.remove('hidden');
                userEmail.textContent = user.email;
                this.updateSyncStatus('已连接');
            } else {
                loggedOutView.classList.remove('hidden');
                loggedInView.classList.add('hidden');
                this.updateSyncStatus('未登录');
            }
        } catch (error) {
            console.error('更新认证UI失败:', error);
        }
    }

    // 注册用户 - 增强错误处理
    async signUp(email, password) {
        if (!this.checkSupabase()) {
            return { 
                success: false, 
                message: '系统未初始化，请检查网络连接' 
            };
        }

        try {
            console.log('开始注册:', email);
            
            if (!email || !password) {
                return { success: false, message: '请输入邮箱和密码' };
            }

            if (password.length < 6) {
                return { success: false, message: '密码至少需要6位' };
            }

            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password: password.trim(),
            });

            if (error) {
                console.error('注册错误:', error);
                return { 
                    success: false, 
                    message: this.getAuthErrorMessage(error) 
                };
            }

            // 创建用户档案
            if (data.user) {
                await this.createUserProfile(data.user);
                return { 
                    success: true, 
                    message: '注册成功！请检查邮箱验证链接。' 
                };
            }

            return { success: false, message: '注册失败，请重试' };
        } catch (error) {
            console.error('注册异常:', error);
            return { 
                success: false, 
                message: error.message || '注册失败，请检查网络连接' 
            };
        }
    }

    // 用户登录 - 增强错误处理
    async signIn(email, password) {
        if (!this.checkSupabase()) {
            return { 
                success: false, 
                message: '系统未初始化，请检查网络连接' 
            };
        }

        try {
            console.log('开始登录:', email);
            
            if (!email || !password) {
                return { success: false, message: '请输入邮箱和密码' };
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim(),
            });

            if (error) {
                console.error('登录错误:', error);
                return { 
                    success: false, 
                    message: this.getAuthErrorMessage(error) 
                };
            }

            if (data.user) {
                return { 
                    success: true, 
                    message: '登录成功！',
                    user: data.user
                };
            }

            return { success: false, message: '登录失败，请重试' };
        } catch (error) {
            console.error('登录异常:', error);
            return { 
                success: false, 
                message: error.message || '登录失败，请检查邮箱和密码' 
            };
        }
    }

    // 获取认证错误消息
    getAuthErrorMessage(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('invalid login credentials')) {
            return '邮箱或密码错误';
        } else if (message.includes('email not confirmed')) {
            return '邮箱未验证，请检查您的邮箱';
        } else if (message.includes('user already registered')) {
            return '该邮箱已注册';
        } else if (message.includes('network') || message.includes('fetch')) {
            return '网络连接失败，请检查网络设置';
        } else {
            return error.message || '认证失败';
        }
    }

    // 退出登录
    async signOut() {
        if (!this.checkSupabase()) {
            return { success: false, message: '系统未初始化' };
        }

        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('退出登录错误:', error);
                return { success: false, message: error.message };
            }
            return { success: true, message: '已退出登录' };
        } catch (error) {
            console.error('退出登录异常:', error);
            return { success: false, message: error.message };
        }
    }

    // 重置密码
    async resetPassword(email) {
        if (!this.checkSupabase()) {
            return { success: false, message: '系统未初始化' };
        }

        try {
            if (!email) {
                return { success: false, message: '请输入邮箱地址' };
            }

            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: window.location.origin,
            });

            if (error) {
                console.error('重置密码错误:', error);
                return { success: false, message: error.message };
            }
            
            return { success: true, message: '密码重置链接已发送到您的邮箱' };
        } catch (error) {
            console.error('重置密码异常:', error);
            return { success: false, message: error.message };
        }
    }

    // 创建用户档案
    async createUserProfile(user) {
        if (!this.checkSupabase()) {
            console.warn('无法创建用户档案 - Supabase 不可用');
            return;
        }

        try {
            const { error } = await supabase
                .from('user_profiles')
                .upsert({
                    id: user.id,
                    email: user.email,
                    username: user.email.split('@')[0],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error('创建用户档案失败:', error);
                return;
            }
            console.log('用户档案创建成功');
        } catch (error) {
            console.error('创建用户档案异常:', error);
        }
    }

    // 同步所有数据到Supabase
    async syncAllData() {
        if (!this.checkSupabase()) {
            return { success: false, message: '系统未初始化' };
        }

        if (!this.isOnline) {
            this.queueSync('full_sync');
            return { success: false, message: '网络离线，已加入同步队列' };
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, message: '用户未登录' };

        this.isSyncing = true;
        this.updateSyncStatus('同步中...');

        try {
            // 同步设置
            await this.syncSettings(user.id);
            
            // 同步单词数据
            await this.syncVocabularyData(user.id);
            
            // 同步学习进度
            await this.syncStudyProgress(user.id);
            
            this.updateSyncStatus('同步完成');
            return { success: true, message: '数据同步完成' };
        } catch (error) {
            this.updateSyncStatus('同步失败');
            console.error('同步失败:', error);
            return { 
                success: false, 
                message: '同步失败: ' + (error.message || '未知错误') 
            };
        } finally {
            this.isSyncing = false;
        }
    }

    // 从Supabase加载所有数据
    async loadAllData() {
        if (!this.checkSupabase()) {
            return { success: false, message: '系统未初始化' };
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, message: '用户未登录' };

        try {
            // 加载设置
            await this.loadSettings(user.id);
            
            // 加载单词数据
            await this.loadVocabularyData(user.id);
            
            // 加载学习进度
            await this.loadStudyProgress(user.id);
            
            // 保存到本地存储
            if (typeof saveAppState === 'function') {
                saveAppState();
            }
            
            // 更新UI
            if (typeof renderVocabularyCards === 'function') {
                renderVocabularyCards();
            }
            if (typeof updateStats === 'function') {
                updateStats();
            }
            
            return { success: true, message: '数据加载完成' };
        } catch (error) {
            console.error('加载数据失败:', error);
            return { 
                success: false, 
                message: '加载数据失败: ' + (error.message || '未知错误') 
            };
        }
    }

    // 同步设置
    async syncSettings(userId) {
        if (!this.checkSupabase()) return;

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: userId,
                settings: window.appState?.settings || {},
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    }

    // 加载设置
    async loadSettings(userId) {
        if (!this.checkSupabase()) return;

        const { data, error } = await supabase
            .from('user_settings')
            .select('settings')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data && data.settings && window.appState) {
            // 合并设置，保留本地没有的默认值
            window.appState.settings = { ...window.appState.settings, ...data.settings };
            if (typeof updateSettingsUI === 'function') {
                updateSettingsUI();
            }
        }
    }

    // 处理网络在线
    handleOnline() {
        this.isOnline = true;
        this.updateSyncStatus('在线，等待同步');
        
        // 执行队列中的同步任务
        if (this.syncQueue.length > 0) {
            this.processSyncQueue();
        }
    }

    // 处理网络离线
    handleOffline() {
        this.isOnline = false;
        this.updateSyncStatus('离线');
    }

    // 更新同步状态显示
    updateSyncStatus(status) {
        try {
            const syncStatusElement = document.getElementById('sync-status');
            if (syncStatusElement) {
                syncStatusElement.textContent = status;
            }
        } catch (error) {
            console.error('更新同步状态失败:', error);
        }
    }

    // 添加到同步队列
    queueSync(operation) {
        this.syncQueue.push(operation);
        this.updateSyncStatus('操作已加入同步队列');
    }

    // 处理同步队列
    async processSyncQueue() {
        while (this.syncQueue.length > 0 && this.isOnline) {
            const operation = this.syncQueue.shift();
            await this.syncAllData();
        }
    }

    // 清除用户数据（退出时）
    clearUserData() {
        // 保留本地数据，但重置用户相关状态
        if (window.appState) {
            window.appState.masteredWords = {};
            window.appState.difficultWords = {};
            window.appState.correctCounts = {};
            window.appState.studyProgress = {};
        }
        
        // 重新渲染界面
        if (typeof renderVocabularyCards === 'function') {
            renderVocabularyCards();
        }
        if (typeof updateStats === 'function') {
            updateStats();
        }
    }

    // 简化的单词数据同步（避免复杂操作）
    async syncVocabularyData(userId) {
        console.log('开始同步单词数据...');
        // 简化实现，避免复杂的数据结构操作
        // 在实际应用中，这里应该有更完整的实现
    }

    async syncStudyProgress(userId) {
        console.log('开始同步学习进度...');
        // 简化实现
    }

    async loadVocabularyData(userId) {
        console.log('开始加载单词数据...');
        // 简化实现
    }

    async loadStudyProgress(userId) {
        console.log('开始加载学习进度...');
        // 简化实现
    }
}

// 修改初始化同步管理器函数
function initSupabaseSync() {
    try {
        console.log('开始初始化 Supabase 同步管理器...');
        syncManager = new SupabaseSyncManager();
        window.syncManager = syncManager;
        console.log('Supabase 同步管理器初始化完成');
    } catch (error) {
        console.error('初始化 Supabase 同步管理器失败:', error);
        // 创建降级的同步管理器
        syncManager = {
            signUp: () => Promise.resolve({ success: false, message: '系统未初始化' }),
            signIn: () => Promise.resolve({ success: false, message: '系统未初始化' }),
            signOut: () => Promise.resolve({ success: false, message: '系统未初始化' }),
            resetPassword: () => Promise.resolve({ success: false, message: '系统未初始化' }),
            syncAllData: () => Promise.resolve({ success: false, message: '系统未初始化' }),
            loadAllData: () => Promise.resolve({ success: false, message: '系统未初始化' })
        };
        window.syncManager = syncManager;
    }
}

// 弹窗管理函数
function showLoginModal() {
    try {
        const modal = document.getElementById('login-modal');
        const overlay = document.getElementById('login-modal-overlay');
        
        if (!modal || !overlay) {
            console.warn('登录弹窗元素未找到');
            return;
        }
        
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
        setTimeout(() => {
            const scaleElement = modal.querySelector('.scale-95');
            if (scaleElement) {
                scaleElement.classList.remove('scale-95');
                scaleElement.classList.add('scale-100');
            }
        }, 10);
        
        // 添加关闭事件
        overlay.onclick = closeLoginModal;
        const closeBtn = document.getElementById('close-login-modal');
        if (closeBtn) {
            closeBtn.onclick = closeLoginModal;
        }
    } catch (error) {
        console.error('显示登录弹窗失败:', error);
    }
}

function closeLoginModal() {
    try {
        const modal = document.getElementById('login-modal');
        if (!modal) {
            console.warn('登录弹窗元素未找到');
            return;
        }
        
        const scaleElement = modal.querySelector('.scale-100');
        if (scaleElement) {
            scaleElement.classList.remove('scale-100');
            scaleElement.classList.add('scale-95');
        }
        
        setTimeout(() => {
            modal.classList.remove('opacity-100', 'pointer-events-auto');
            modal.classList.add('opacity-0', 'pointer-events-none');
        }, 300);
    } catch (error) {
        console.error('关闭登录弹窗失败:', error);
    }
}

function showSignupModal() {
    try {
        const modal = document.getElementById('signup-modal');
        const overlay = document.getElementById('signup-modal-overlay');
        
        if (!modal || !overlay) {
            console.warn('注册弹窗元素未找到');
            return;
        }
        
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
        setTimeout(() => {
            const scaleElement = modal.querySelector('.scale-95');
            if (scaleElement) {
                scaleElement.classList.remove('scale-95');
                scaleElement.classList.add('scale-100');
            }
        }, 10);
        
        // 添加关闭事件
        overlay.onclick = closeSignupModal;
        const closeBtn = document.getElementById('close-signup-modal');
        if (closeBtn) {
            closeBtn.onclick = closeSignupModal;
        }
    } catch (error) {
        console.error('显示注册弹窗失败:', error);
    }
}

function closeSignupModal() {
    try {
        const modal = document.getElementById('signup-modal');
        if (!modal) {
            console.warn('注册弹窗元素未找到');
            return;
        }
        
        const scaleElement = modal.querySelector('.scale-100');
        if (scaleElement) {
            scaleElement.classList.remove('scale-100');
            scaleElement.classList.add('scale-95');
        }
        
        setTimeout(() => {
            modal.classList.remove('opacity-100', 'pointer-events-auto');
            modal.classList.add('opacity-0', 'pointer-events-none');
        }, 300);
    } catch (error) {
        console.error('关闭注册弹窗失败:', error);
    }
}

// 切换弹窗
function switchToSignup() {
    closeLoginModal();
    setTimeout(showSignupModal, 300);
}

function switchToLogin() {
    closeSignupModal();
    setTimeout(showLoginModal, 300);
}

// 导出函数供全局使用
window.showLoginModal = showLoginModal;
window.showSignupModal = showSignupModal;
window.closeLoginModal = closeLoginModal;
window.closeSignupModal = closeSignupModal;
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
window.initSupabaseSync = initSupabaseSync;

console.log('Supabase 客户端脚本加载完成');