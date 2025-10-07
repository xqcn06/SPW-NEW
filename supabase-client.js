// Supabase客户端配置
const SUPABASE_CONFIG = {
    url: 'https://elwiegxinwdrglxulfcw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsd2llZ3hpbndkcmdseHVsZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4MTQwNjcsImV4cCI6MjA3NTM5MDA2N30.ToMdeBiSfxG8TihDzfg-pQHjGXHrDFnzmCJP2kMBTW0'
};

// 创建Supabase客户端
const supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: localStorage
    }
});

// Supabase数据同步管理
class SupabaseSyncManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.isSyncing = false;
        
        // 监听网络状态
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // 初始化认证状态监听
        this.initAuthListener();
    }

    // 初始化认证监听
    async initAuthListener() {
        // 检查现有会话
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            console.log('发现现有会话:', session.user.email);
            this.updateAuthUI(session.user);
            // 自动加载用户数据
            setTimeout(() => {
                this.loadAllData();
            }, 1000);
        }

        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event, session?.user?.email);
            
            if (event === 'SIGNED_IN' && session) {
                this.updateAuthUI(session.user);
                this.syncAllData();
                this.loadAllData();
                showToast('登录成功！', 'success');
            } else if (event === 'SIGNED_OUT') {
                this.updateAuthUI(null);
                this.clearUserData();
                showToast('已退出登录', 'info');
            } else if (event === 'USER_UPDATED') {
                this.updateAuthUI(session.user);
            }
        });
    }

    // 更新认证UI
    updateAuthUI(user) {
        const loggedOutView = document.getElementById('logged-out-view');
        const loggedInView = document.getElementById('logged-in-view');
        const userEmail = document.getElementById('user-email');

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
    }

    // 注册用户
    async signUp(email, password) {
        try {
            console.log('开始注册:', email);
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password: password.trim(),
            });

            if (error) {
                console.error('注册错误:', error);
                throw error;
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

    // 用户登录
    async signIn(email, password) {
        try {
            console.log('开始登录:', email);
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim(),
            });

            if (error) {
                console.error('登录错误:', error);
                throw error;
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

    // 退出登录
    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return { success: true, message: '已退出登录' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 重置密码
    async resetPassword(email) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
            if (error) throw error;
            return { success: true, message: '密码重置链接已发送到您的邮箱' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 创建用户档案
    async createUserProfile(user) {
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
            return { success: false, message: '同步失败: ' + error.message };
        } finally {
            this.isSyncing = false;
        }
    }

    // 从Supabase加载所有数据
    async loadAllData() {
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
            saveAppState();
            
            // 更新UI
            renderVocabularyCards();
            updateStats();
            
            return { success: true, message: '数据加载完成' };
        } catch (error) {
            console.error('加载数据失败:', error);
            return { success: false, message: '加载数据失败: ' + error.message };
        }
    }

    // 同步设置
    async syncSettings(userId) {
        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: userId,
                settings: appState.settings,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    }

    // 加载设置
    async loadSettings(userId) {
        const { data, error } = await supabase
            .from('user_settings')
            .select('settings')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data && data.settings) {
            // 合并设置，保留本地没有的默认值
            appState.settings = { ...appState.settings, ...data.settings };
            updateSettingsUI();
        }
    }

    // 同步单词数据
    async syncVocabularyData(userId) {
        // 同步每个单元的单词
        for (const [unitNumber, words] of Object.entries(appState.units)) {
            // 首先创建或获取单元
            const unit = await this.getOrCreateUnit(userId, parseInt(unitNumber));
            
            // 同步单元中的每个单词
            for (const wordData of words) {
                await this.syncWord(userId, unit.id, wordData);
            }
        }
    }

    // 获取或创建单元
    async getOrCreateUnit(userId, unitNumber) {
        const { data: existingUnit, error: selectError } = await supabase
            .from('vocabulary_units')
            .select('*')
            .eq('user_id', userId)
            .eq('unit_number', unitNumber)
            .single();

        if (selectError && selectError.code !== 'PGRST116') throw selectError;

        if (existingUnit) {
            return existingUnit;
        } else {
            const { data: newUnit, error: insertError } = await supabase
                .from('vocabulary_units')
                .insert({
                    user_id: userId,
                    unit_number: unitNumber,
                    unit_name: `单元 ${unitNumber}`,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) throw insertError;
            return newUnit;
        }
    }

    // 同步单个单词
    async syncWord(userId, unitId, wordData) {
        const { data: existingWord, error: selectError } = await supabase
            .from('vocabulary_words')
            .select('*')
            .eq('user_id', userId)
            .eq('unit_id', unitId)
            .eq('word', wordData.word)
            .single();

        if (selectError && selectError.code !== 'PGRST116') throw selectError;

        const wordRecord = {
            user_id: userId,
            unit_id: unitId,
            word: wordData.word,
            phonetic: wordData.phonetic,
            part_of_speech: wordData.partOfSpeech,
            definition: wordData.definition,
            example: wordData.example,
            memory: wordData.memory,
            derivative: wordData.derivative,
            extra_data: wordData.extra || null,
            updated_at: new Date().toISOString()
        };

        if (existingWord) {
            // 更新现有单词
            const { error } = await supabase
                .from('vocabulary_words')
                .update(wordRecord)
                .eq('id', existingWord.id);

            if (error) throw error;
        } else {
            // 插入新单词
            wordRecord.created_at = new Date().toISOString();
            const { error } = await supabase
                .from('vocabulary_words')
                .insert(wordRecord);

            if (error) throw error;
        }
    }

    // 同步学习进度
    async syncStudyProgress(userId) {
        // 同步已掌握的单词
        for (const [wordKey, isMastered] of Object.entries(appState.masteredWords)) {
            if (isMastered) {
                await this.syncWordProgress(userId, wordKey, { is_mastered: true });
            }
        }

        // 同步生词本
        for (const [wordKey, isDifficult] of Object.entries(appState.difficultWords)) {
            if (isDifficult) {
                await this.syncWordProgress(userId, wordKey, { 
                    is_difficult: true,
                    correct_count: appState.correctCounts[wordKey] || 0
                });
            }
        }

        // 同步学习记录
        await this.syncStudyRecords(userId);
    }

    // 同步单词进度
    async syncWordProgress(userId, wordKey, progressData) {
        const [unitNumber, word] = wordKey.split('-');
        
        // 获取单元
        const unit = await this.getOrCreateUnit(userId, parseInt(unitNumber));
        
        // 获取单词ID
        const { data: wordRecord, error: wordError } = await supabase
            .from('vocabulary_words')
            .select('id')
            .eq('user_id', userId)
            .eq('unit_id', unit.id)
            .eq('word', word)
            .single();

        if (wordError) {
            console.warn(`找不到单词: ${word}, 跳过同步进度`);
            return;
        }

        // 更新或插入学习进度
        const { error } = await supabase
            .from('study_progress')
            .upsert({
                user_id: userId,
                word_id: wordRecord.id,
                ...progressData,
                last_studied: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,word_id'
            });

        if (error) throw error;
    }

    // 同步学习记录
    async syncStudyRecords(userId) {
        for (const [date, unitProgress] of Object.entries(appState.studyProgress)) {
            for (const [unitNumber, studiedCount] of Object.entries(unitProgress)) {
                const unit = await this.getOrCreateUnit(userId, parseInt(unitNumber));
                
                const { error } = await supabase
                    .from('daily_study_records')
                    .upsert({
                        user_id: userId,
                        study_date: date,
                        unit_id: unit.id,
                        words_studied: studiedCount,
                        words_mastered: 0,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'user_id,study_date,unit_id'
                    });

                if (error) throw error;
            }
        }
    }

    // 从Supabase加载单词数据
    async loadVocabularyData(userId) {
        // 获取所有单元
        const { data: units, error: unitsError } = await supabase
            .from('vocabulary_units')
            .select('*')
            .eq('user_id', userId)
            .order('unit_number');

        if (unitsError) throw unitsError;

        // 重置本地数据
        appState.units = {};

        for (const unit of units || []) {
            // 获取该单元的所有单词
            const { data: words, error: wordsError } = await supabase
                .from('vocabulary_words')
                .select('*')
                .eq('user_id', userId)
                .eq('unit_id', unit.id)
                .order('created_at');

            if (wordsError) throw wordsError;

            // 转换数据格式
            appState.units[unit.unit_number] = (words || []).map(word => ({
                word: word.word,
                phonetic: word.phonetic,
                partOfSpeech: word.part_of_speech,
                definition: word.definition,
                example: word.example,
                memory: word.memory,
                derivative: word.derivative,
                extra: word.extra_data
            }));
        }

        // 重新计算分块
        if (appState.units[appState.currentUnit]) {
            calculateChunks(appState.units[appState.currentUnit]);
        }
    }

    // 从Supabase加载学习进度
    async loadStudyProgress(userId) {
        // 重置本地进度
        appState.masteredWords = {};
        appState.difficultWords = {};
        appState.correctCounts = {};
        appState.studyProgress = {};

        // 获取学习进度
        const { data: progressRecords, error: progressError } = await supabase
            .from('study_progress')
            .select(`
                *,
                vocabulary_words (
                    word,
                    vocabulary_units (
                        unit_number
                    )
                )
            `)
            .eq('user_id', userId);

        if (progressError) throw progressError;

        // 处理学习进度
        for (const record of progressRecords || []) {
            if (record.vocabulary_words && record.vocabulary_words.vocabulary_units) {
                const wordKey = `${record.vocabulary_words.vocabulary_units.unit_number}-${record.vocabulary_words.word}`;
                
                if (record.is_mastered) {
                    appState.masteredWords[wordKey] = true;
                }
                
                if (record.is_difficult) {
                    appState.difficultWords[wordKey] = true;
                    appState.correctCounts[wordKey] = record.correct_count || 0;
                }
            }
        }

        // 获取学习记录
        const { data: studyRecords, error: recordsError } = await supabase
            .from('daily_study_records')
            .select(`
                *,
                vocabulary_units (
                    unit_number
                )
            `)
            .eq('user_id', userId);

        if (recordsError) throw recordsError;

        // 处理学习记录
        for (const record of studyRecords || []) {
            if (record.vocabulary_units) {
                const date = record.study_date;
                const unitNumber = record.vocabulary_units.unit_number;
                
                if (!appState.studyProgress[date]) {
                    appState.studyProgress[date] = {};
                }
                appState.studyProgress[date][unitNumber] = record.words_studied;
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
        const syncStatusElement = document.getElementById('sync-status');
        if (syncStatusElement) {
            syncStatusElement.textContent = status;
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
        appState.masteredWords = {};
        appState.difficultWords = {};
        appState.correctCounts = {};
        appState.studyProgress = {};
        
        // 重新渲染界面
        renderVocabularyCards();
        updateStats();
    }
}

// 创建全局同步管理器实例
let syncManager;

// 初始化同步管理器
function initSupabaseSync() {
    syncManager = new SupabaseSyncManager();
}

// 弹窗管理函数
function showLoginModal() {
    const modal = document.getElementById('login-modal');
    const overlay = document.getElementById('login-modal-overlay');
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    setTimeout(() => {
        modal.querySelector('.scale-95').classList.remove('scale-95');
        modal.querySelector('.scale-95').classList.add('scale-100');
    }, 10);
    
    // 添加关闭事件
    overlay.onclick = closeLoginModal;
    document.getElementById('close-login-modal').onclick = closeLoginModal;
}

function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    modal.querySelector('.scale-100').classList.remove('scale-100');
    modal.querySelector('.scale-100').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.remove('opacity-100', 'pointer-events-auto');
        modal.classList.add('opacity-0', 'pointer-events-none');
    }, 300);
}

function showSignupModal() {
    const modal = document.getElementById('signup-modal');
    const overlay = document.getElementById('signup-modal-overlay');
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    setTimeout(() => {
        modal.querySelector('.scale-95').classList.remove('scale-95');
        modal.querySelector('.scale-95').classList.add('scale-100');
    }, 10);
    
    // 添加关闭事件
    overlay.onclick = closeSignupModal;
    document.getElementById('close-signup-modal').onclick = closeSignupModal;
}

function closeSignupModal() {
    const modal = document.getElementById('signup-modal');
    modal.querySelector('.scale-100').classList.remove('scale-100');
    modal.querySelector('.scale-100').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.remove('opacity-100', 'pointer-events-auto');
        modal.classList.add('opacity-0', 'pointer-events-none');
    }, 300);
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