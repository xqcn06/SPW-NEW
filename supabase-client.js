// supabase-client.js - 完全重写版本
console.log('开始加载增强版 Supabase 客户端...');

// Supabase 配置
const SUPABASE_CONFIG = {
    url: 'https://elwiegxinwdrglxulfcw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsd2llZ3hpbndkcmdseHVsZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4MTQwNjcsImV4cCI6MjA3NTM5MDA2N30.ToMdeBiSfxG8TihDzfg-pQHjGXHrDFnzmCJP2kMBTW0'
};

// 增强的 Supabase 初始化
class SupabaseManager {
    constructor() {
        this.client = null;
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.init();
    }

    async init() {
        try {
            console.log('开始初始化 Supabase...');
            
            // 检查 Supabase 库是否加载
            if (typeof createClient === 'undefined') {
                await this.loadSupabaseLibrary();
            }
            
            // 创建客户端
            this.client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    storage: localStorage,
                    flowType: 'pkce',
                    redirectTo: 'https://xqcn06.github.io/SPW-NEW/auth-callback.html'
                },
                db: {
                    schema: 'public'
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            });

            // 测试连接
            await this.testConnection();
            
            this.isInitialized = true;
            console.log('✅ Supabase 初始化成功');
            
            // 设置全局变量
            window.supabase = this.client;
            
        } catch (error) {
            console.error('❌ Supabase 初始化失败:', error);
            this.client = this.createFallbackClient();
            window.supabase = this.client;
        }
    }

    async loadSupabaseLibrary() {
        return new Promise((resolve, reject) => {
            if (typeof createClient !== 'undefined') {
                resolve();
                return;
            }

            console.log('动态加载 Supabase 库...');
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
                console.log('Supabase 库加载成功');
                resolve();
            };
            script.onerror = () => {
                console.error('Supabase 库加载失败');
                reject(new Error('无法加载 Supabase 库'));
            };
            document.head.appendChild(script);
        });
    }

    async testConnection() {
        try {
            const { data, error } = await this.client.from('user_profiles').select('count').limit(1);
            if (error) throw error;
            console.log('✅ Supabase 连接测试成功');
        } catch (error) {
            console.warn('⚠️ Supabase 连接测试失败，使用降级模式:', error.message);
            throw error;
        }
    }

    createFallbackClient() {
        console.warn('创建降级 Supabase 客户端');
        return {
            auth: {
                getSession: () => Promise.resolve({ data: { session: null }, error: null }),
                getUser: () => Promise.resolve({ data: { user: null }, error: null }),
                signUp: () => Promise.resolve({ data: null, error: new Error('离线模式') }),
                signInWithPassword: () => Promise.resolve({ data: null, error: new Error('离线模式') }),
                signOut: () => Promise.resolve({ error: new Error('离线模式') }),
                onAuthStateChange: (callback) => {
                    // 模拟认证状态变化
                    setTimeout(() => callback('SIGNED_OUT', null), 100);
                    return { data: { subscription: { unsubscribe: () => {} } } };
                },
                resetPasswordForEmail: () => Promise.resolve({ error: new Error('离线模式') })
            },
            from: () => ({
                select: () => ({
                    eq: () => ({
                        single: () => Promise.resolve({ data: null, error: new Error('离线模式') }),
                        limit: () => Promise.resolve({ data: [], error: new Error('离线模式') })
                    }),
                    order: () => Promise.resolve({ data: [], error: new Error('离线模式') })
                }),
                upsert: () => Promise.resolve({ error: new Error('离线模式') }),
                insert: () => Promise.resolve({ error: new Error('离线模式') }),
                update: () => Promise.resolve({ error: new Error('离线模式') }),
                delete: () => Promise.resolve({ error: new Error('离线模式') })
            }),
            channel: () => ({
                on: () => ({ subscribe: () => {} })
            })
        };
    }

    getClient() {
        return this.client;
    }

    isReady() {
        return this.isInitialized && this.client !== null;
    }
}

// 完整的数据同步管理器
class DataSyncManager {
    constructor() {
        this.supabaseManager = new SupabaseManager();
        this.supabase = null;
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.isSyncing = false;
        this.lastSyncTime = null;
        
        console.log('初始化数据同步管理器...');
        
        // 网络状态监听
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // 延迟初始化
        setTimeout(() => this.initialize(), 1000);
    }

    async initialize() {
        this.supabase = this.supabaseManager.getClient();
        
        // 初始化认证监听
        await this.initAuthListener();
        
        // 检查现有会话
        await this.checkExistingSession();
    }

    async initAuthListener() {
        if (!this.supabase?.auth) {
            console.warn('Supabase auth 不可用，跳过认证监听');
            return;
        }

        try {
            const { data: { subscription } } = this.supabase.auth.onAuthStateChange(
                async (event, session) => {
                    console.log('认证状态变化:', event, session?.user?.email);
                    
                    switch (event) {
                        case 'SIGNED_IN':
                            await this.handleSignedIn(session);
                            break;
                        case 'SIGNED_OUT':
                            this.handleSignedOut();
                            break;
                        case 'USER_UPDATED':
                            this.updateAuthUI(session.user);
                            break;
                        case 'TOKEN_REFRESHED':
                            console.log('令牌已刷新');
                            break;
                    }
                }
            );

            this.authSubscription = subscription;
            console.log('✅ 认证监听器已启动');

        } catch (error) {
            console.error('初始化认证监听失败:', error);
        }
    }

    async checkExistingSession() {
        try {
            const { data: { session }, error } = await this.supabase.auth.getSession();
            
            if (error) {
                console.warn('获取会话失败:', error);
                return;
            }
            
            if (session) {
                console.log('发现现有会话:', session.user.email);
                await this.handleSignedIn(session);
            }
        } catch (error) {
            console.error('检查会话失败:', error);
        }
    }

    async handleSignedIn(session) {
        this.updateAuthUI(session.user);
        
        // 加载用户数据
        await this.loadAllData();
        
        // 同步本地数据到云端
        await this.syncAllData();
        
        showToast('登录成功！数据已同步', 'success');
    }

    handleSignedOut() {
        this.updateAuthUI(null);
        showToast('已退出登录', 'info');
    }

    // 用户认证方法
    async signUp(email, password) {
        try {
            if (!this.supabase?.auth) {
                return { success: false, message: '系统未初始化' };
            }

            // 输入验证
            if (!email || !password) {
                return { success: false, message: '请输入邮箱和密码' };
            }

            if (password.length < 6) {
                return { success: false, message: '密码至少需要6位' };
            }

            console.log('开始用户注册:', email);

            const { data, error } = await this.supabase.auth.signUp({
                email: email.trim(),
                password: password.trim(),
                options: {
                    emailRedirectTo: 'https://xqcn06.github.io/SPW-NEW/auth-callback.html'
                }
            });

            if (error) {
                console.error('注册错误:', error);
                return { 
                    success: false, 
                    message: this.getAuthErrorMessage(error) 
                };
            }

            if (data.user) {
                // 创建用户档案
                await this.createUserProfile(data.user);
                
                return { 
                    success: true, 
                    message: data.user.identities?.length === 0 
                        ? '该邮箱已注册，请直接登录' 
                        : '注册成功！请检查邮箱验证链接。' 
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

    async signIn(email, password) {
        try {
            if (!this.supabase?.auth) {
                return { success: false, message: '系统未初始化' };
            }

            if (!email || !password) {
                return { success: false, message: '请输入邮箱和密码' };
            }

            console.log('开始用户登录:', email);

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim()
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

    async signOut() {
        try {
            if (!this.supabase?.auth) {
                return { success: false, message: '系统未初始化' };
            }

            const { error } = await this.supabase.auth.signOut();
            
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

    async resetPassword(email) {
        try {
            if (!this.supabase?.auth) {
                return { success: false, message: '系统未初始化' };
            }

            if (!email) {
                return { success: false, message: '请输入邮箱地址' };
            }

            const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: 'https://xqcn06.github.io/SPW-NEW/auth-callback.html'
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

    // 数据同步方法 - 完整实现
    async syncAllData() {
        try {
            if (!this.supabaseManager.isReady()) {
                return { success: false, message: '系统未初始化' };
            }

            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) {
                return { success: false, message: '用户未登录' };
            }

            this.isSyncing = true;
            this.updateSyncStatus('同步中...');

            console.log('开始完整数据同步...');

            // 同步用户设置
            await this.syncUserSettings(user.id);
            
            // 同步单词数据
            await this.syncVocabularyData(user.id);
            
            // 同步学习进度
            await this.syncStudyProgress(user.id);
            
            // 同步每日进度
            await this.syncDailyProgress(user.id);

            this.lastSyncTime = new Date();
            this.updateSyncStatus('同步完成');
            
            console.log('✅ 数据同步完成');
            return { success: true, message: '数据同步完成' };

        } catch (error) {
            console.error('数据同步失败:', error);
            this.updateSyncStatus('同步失败');
            return { 
                success: false, 
                message: '同步失败: ' + (error.message || '未知错误') 
            };
        } finally {
            this.isSyncing = false;
        }
    }

    async syncUserSettings(userId) {
        try {
            if (!window.appState?.settings) {
                console.warn('没有设置数据可同步');
                return;
            }

            const settingsData = {
                user_id: userId,
                settings: window.appState.settings,
                updated_at: new Date().toISOString()
            };

            const { error } = await this.supabase
                .from('user_settings')
                .upsert(settingsData, { 
                    onConflict: 'user_id',
                    ignoreDuplicates: false 
                });

            if (error) throw error;
            
            console.log('✅ 用户设置同步成功');

        } catch (error) {
            console.error('同步用户设置失败:', error);
            throw error;
        }
    }

    async syncVocabularyData(userId) {
        try {
            if (!window.appState?.units) {
                console.warn('没有单词数据可同步');
                return;
            }

            console.log('开始同步单词数据...');

            for (const [unitNumber, words] of Object.entries(window.appState.units)) {
                if (!words || words.length === 0) continue;

                // 同步单元
                const unitData = {
                    user_id: userId,
                    unit_number: parseInt(unitNumber),
                    unit_name: `单元 ${unitNumber}`,
                    created_at: new Date().toISOString()
                };

                const { data: unit, error: unitError } = await this.supabase
                    .from('vocabulary_units')
                    .upsert(unitData, { onConflict: 'user_id,unit_number' })
                    .select()
                    .single();

                if (unitError) throw unitError;

                // 同步单词
                const wordPromises = words.map(async (wordData) => {
                    const wordRecord = {
                        user_id: userId,
                        unit_id: unit.id,
                        word: wordData.word,
                        phonetic: wordData.phonetic,
                        part_of_speech: wordData.partOfSpeech,
                        definition: wordData.definition,
                        example: wordData.example,
                        memory: wordData.memory,
                        derivative: wordData.derivative,
                        extra_data: wordData.extra || {},
                        created_at: new Date().toISOString()
                    };

                    const { error } = await this.supabase
                        .from('vocabulary_words')
                        .upsert(wordRecord, { 
                            onConflict: 'user_id,unit_id,word',
                            ignoreDuplicates: false 
                        });

                    if (error) {
                        console.warn(`同步单词失败 "${wordData.word}":`, error);
                    }
                });

                await Promise.allSettled(wordPromises);
            }

            console.log('✅ 单词数据同步成功');

        } catch (error) {
            console.error('同步单词数据失败:', error);
            throw error;
        }
    }

    async syncStudyProgress(userId) {
        try {
            if (!window.appState?.masteredWords && !window.appState?.difficultWords) {
                console.warn('没有学习进度数据可同步');
                return;
            }

            console.log('开始同步学习进度...');

            // 获取所有单词记录
            const { data: allWords, error: wordsError } = await this.supabase
                .from('vocabulary_words')
                .select('id, word, unit_id, vocabulary_units(unit_number)')
                .eq('user_id', userId);

            if (wordsError) throw wordsError;

            const progressPromises = [];

            // 处理 masteredWords
            if (window.appState.masteredWords) {
                Object.keys(window.appState.masteredWords).forEach(key => {
                    const [unitNumber, word] = key.split('-');
                    const wordRecord = allWords?.find(w => 
                        w.word === word && w.vocabulary_units.unit_number === parseInt(unitNumber)
                    );

                    if (wordRecord) {
                        const progressData = {
                            user_id: userId,
                            word_id: wordRecord.id,
                            is_mastered: true,
                            is_difficult: window.appState.difficultWords[key] || false,
                            correct_count: window.appState.correctCounts[key] || 0,
                            last_studied: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };

                        progressPromises.push(
                            this.supabase
                                .from('study_progress')
                                .upsert(progressData, { onConflict: 'user_id,word_id' })
                        );
                    }
                });
            }

            // 处理 difficultWords
            if (window.appState.difficultWords) {
                Object.keys(window.appState.difficultWords).forEach(key => {
                    if (window.appState.masteredWords?.[key]) return; // 已处理

                    const [unitNumber, word] = key.split('-');
                    const wordRecord = allWords?.find(w => 
                        w.word === word && w.vocabulary_units.unit_number === parseInt(unitNumber)
                    );

                    if (wordRecord) {
                        const progressData = {
                            user_id: userId,
                            word_id: wordRecord.id,
                            is_mastered: false,
                            is_difficult: true,
                            correct_count: window.appState.correctCounts[key] || 0,
                            last_studied: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };

                        progressPromises.push(
                            this.supabase
                                .from('study_progress')
                                .upsert(progressData, { onConflict: 'user_id,word_id' })
                        );
                    }
                });
            }

            await Promise.allSettled(progressPromises);
            console.log('✅ 学习进度同步成功');

        } catch (error) {
            console.error('同步学习进度失败:', error);
            throw error;
        }
    }

    async syncDailyProgress(userId) {
        try {
            if (!window.appState?.studyProgress) {
                console.warn('没有每日进度数据可同步');
                return;
            }

            console.log('开始同步每日进度...');

            const today = new Date().toISOString().split('T')[0];
            const studiedToday = window.appState.studyProgress[today]?.[window.appState.currentUnit] || 0;

            if (studiedToday > 0) {
                // 获取当前单元ID
                const { data: unit, error: unitError } = await this.supabase
                    .from('vocabulary_units')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('unit_number', window.appState.currentUnit)
                    .single();

                if (unitError && unitError.code !== 'PGRST116') throw unitError;

                if (unit) {
                    const dailyRecord = {
                        user_id: userId,
                        study_date: today,
                        unit_id: unit.id,
                        words_studied: studiedToday,
                        words_mastered: Object.values(window.appState.masteredWords || {}).filter(v => v).length,
                        created_at: new Date().toISOString()
                    };

                    const { error } = await this.supabase
                        .from('daily_study_records')
                        .upsert(dailyRecord, { 
                            onConflict: 'user_id,study_date,unit_id' 
                        });

                    if (error) throw error;
                }
            }

            console.log('✅ 每日进度同步成功');

        } catch (error) {
            console.error('同步每日进度失败:', error);
            throw error;
        }
    }

    // 数据加载方法 - 完整实现
    async loadAllData() {
        try {
            if (!this.supabaseManager.isReady()) {
                return { success: false, message: '系统未初始化' };
            }

            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) {
                return { success: false, message: '用户未登录' };
            }

            console.log('开始加载用户数据...');

            // 加载设置
            await this.loadUserSettings(user.id);
            
            // 加载单词数据
            await this.loadVocabularyData(user.id);
            
            // 加载学习进度
            await this.loadStudyProgress(user.id);

            // 保存到本地并更新UI
            if (typeof saveAppState === 'function') {
                saveAppState();
            }
            if (typeof renderVocabularyCards === 'function') {
                renderVocabularyCards();
            }
            if (typeof updateStats === 'function') {
                updateStats();
            }

            console.log('✅ 用户数据加载完成');
            return { success: true, message: '数据加载完成' };

        } catch (error) {
            console.error('加载数据失败:', error);
            return { 
                success: false, 
                message: '加载数据失败: ' + (error.message || '未知错误') 
            };
        }
    }

    async loadUserSettings(userId) {
        try {
            const { data, error } = await this.supabase
                .from('user_settings')
                .select('settings')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.warn('加载用户设置失败:', error);
                return;
            }

            if (data?.settings && window.appState) {
                // 深度合并设置，保留本地默认值
                window.appState.settings = this.deepMerge(
                    window.appState.settings, 
                    data.settings
                );
                
                if (typeof updateSettingsUI === 'function') {
                    updateSettingsUI();
                }
                
                console.log('✅ 用户设置加载成功');
            }

        } catch (error) {
            console.error('加载用户设置异常:', error);
        }
    }

    async loadVocabularyData(userId) {
        try {
            const { data: units, error: unitsError } = await this.supabase
                .from('vocabulary_units')
                .select('id, unit_number')
                .eq('user_id', userId)
                .order('unit_number');

            if (unitsError) {
                console.warn('加载单词单元失败:', unitsError);
                return;
            }

            if (!units || units.length === 0) {
                console.log('没有云端单词数据');
                return;
            }

            // 重置本地单元数据，使用云端数据
            window.appState.units = {};

            for (const unit of units) {
                const { data: words, error: wordsError } = await this.supabase
                    .from('vocabulary_words')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('unit_id', unit.id)
                    .order('created_at');

                if (wordsError) {
                    console.warn(`加载单元 ${unit.unit_number} 单词失败:`, wordsError);
                    continue;
                }

                if (words && words.length > 0) {
                    // 转换数据格式
                    window.appState.units[unit.unit_number] = words.map(word => ({
                        word: word.word,
                        phonetic: word.phonetic,
                        partOfSpeech: word.part_of_speech,
                        definition: word.definition,
                        example: word.example,
                        memory: word.memory,
                        derivative: word.derivative,
                        extra: word.extra_data || {}
                    }));
                }
            }

            console.log('✅ 单词数据加载成功');

        } catch (error) {
            console.error('加载单词数据异常:', error);
        }
    }

    async loadStudyProgress(userId) {
        try {
            const { data: progress, error } = await this.supabase
                .from('study_progress')
                .select(`
                    correct_count,
                    is_mastered,
                    is_difficult,
                    vocabulary_words (
                        word,
                        vocabulary_units (
                            unit_number
                        )
                    )
                `)
                .eq('user_id', userId);

            if (error) {
                console.warn('加载学习进度失败:', error);
                return;
            }

            if (progress && progress.length > 0) {
                // 重置本地进度数据
                window.appState.masteredWords = {};
                window.appState.difficultWords = {};
                window.appState.correctCounts = {};

                progress.forEach(item => {
                    const word = item.vocabulary_words?.word;
                    const unitNumber = item.vocabulary_words?.vocabulary_units?.unit_number;
                    
                    if (word && unitNumber) {
                        const key = `${unitNumber}-${word}`;
                        
                        if (item.is_mastered) {
                            window.appState.masteredWords[key] = true;
                        }
                        if (item.is_difficult) {
                            window.appState.difficultWords[key] = true;
                        }
                        if (item.correct_count > 0) {
                            window.appState.correctCounts[key] = item.correct_count;
                        }
                    }
                });

                console.log('✅ 学习进度加载成功');
            }

        } catch (error) {
            console.error('加载学习进度异常:', error);
        }
    }

    // 工具方法
    deepMerge(target, source) {
        const output = { ...target };
        
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    output[key] = source[key];
                }
            });
        }
        
        return output;
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    updateAuthUI(user) {
        try {
            const loggedOutView = document.getElementById('logged-out-view');
            const loggedInView = document.getElementById('logged-in-view');
            const userEmail = document.getElementById('user-email');
            const syncStatus = document.getElementById('sync-status');

            if (!loggedOutView || !loggedInView) {
                return;
            }

            if (user) {
                loggedOutView.classList.add('hidden');
                loggedInView.classList.remove('hidden');
                if (userEmail) userEmail.textContent = user.email;
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

    updateSyncStatus(status) {
        try {
            const syncStatusElement = document.getElementById('sync-status');
            if (syncStatusElement) {
                syncStatusElement.textContent = status;
                
                // 添加状态类名
                syncStatusElement.className = 'text-xs mt-1 ';
                if (status.includes('失败') || status.includes('离线')) {
                    syncStatusElement.classList.add('text-danger');
                } else if (status.includes('成功') || status.includes('完成')) {
                    syncStatusElement.classList.add('text-success');
                } else if (status.includes('同步中')) {
                    syncStatusElement.classList.add('text-warning');
                } else {
                    syncStatusElement.classList.add('text-light-textLight', 'dark:text-dark-textLight');
                }
            }
        } catch (error) {
            console.error('更新同步状态失败:', error);
        }
    }

    handleOnline() {
        this.isOnline = true;
        this.updateSyncStatus('在线，等待同步');
        
        // 重新尝试同步
        if (this.syncQueue.length > 0) {
            this.processSyncQueue();
        }
    }

    handleOffline() {
        this.isOnline = false;
        this.updateSyncStatus('离线');
    }

    queueSync(operation) {
        this.syncQueue.push(operation);
        this.updateSyncStatus('操作已加入同步队列');
    }

    async processSyncQueue() {
        while (this.syncQueue.length > 0 && this.isOnline) {
            const operation = this.syncQueue.shift();
            try {
                await this.syncAllData();
            } catch (error) {
                console.error('处理同步队列失败:', error);
            }
        }
    }

    async createUserProfile(user) {
        try {
            const { error } = await this.supabase
                .from('user_profiles')
                .upsert({
                    id: user.id,
                    email: user.email,
                    username: user.email.split('@')[0],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'id'
                });

            if (error) {
                console.error('创建用户档案失败:', error);
                return;
            }
            
            console.log('✅ 用户档案创建成功');

        } catch (error) {
            console.error('创建用户档案异常:', error);
        }
    }
}

// 全局初始化
let syncManager = null;

function initSupabaseSync() {
    try {
        console.log('初始化 Supabase 同步系统...');
        syncManager = new DataSyncManager();
        window.syncManager = syncManager;
        console.log('✅ Supabase 同步系统初始化完成');
    } catch (error) {
        console.error('❌ 初始化 Supabase 同步系统失败:', error);
        // 创建降级的同步管理器
        syncManager = {
            signUp: () => Promise.resolve({ success: false, message: '系统初始化失败' }),
            signIn: () => Promise.resolve({ success: false, message: '系统初始化失败' }),
            signOut: () => Promise.resolve({ success: false, message: '系统初始化失败' }),
            resetPassword: () => Promise.resolve({ success: false, message: '系统初始化失败' }),
            syncAllData: () => Promise.resolve({ success: false, message: '系统初始化失败' }),
            loadAllData: () => Promise.resolve({ success: false, message: '系统初始化失败' })
        };
        window.syncManager = syncManager;
    }
}

// 弹窗管理函数（保持不变）
function showLoginModal() {
    // ... 保持原有实现
}

function closeLoginModal() {
    // ... 保持原有实现
}

function showSignupModal() {
    // ... 保持原有实现
}

function closeSignupModal() {
    // ... 保持原有实现
}

function switchToSignup() {
    closeLoginModal();
    setTimeout(showSignupModal, 300);
}

function switchToLogin() {
    closeSignupModal();
    setTimeout(showLoginModal, 300);
}

// 导出全局函数
window.showLoginModal = showLoginModal;
window.showSignupModal = showSignupModal;
window.closeLoginModal = closeLoginModal;
window.closeSignupModal = closeSignupModal;
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
window.initSupabaseSync = initSupabaseSync;

// 自动初始化
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (typeof initSupabaseSync === 'function') {
            initSupabaseSync();
        }
    }, 2000);
});

console.log('✅ 增强版 Supabase 客户端加载完成');