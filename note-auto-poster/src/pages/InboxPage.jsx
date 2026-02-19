import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import SetupBanner from '../components/common/SetupBanner';
import ConfirmDialog from '../components/common/ConfirmDialog';
import FilterPanel from '../components/inbox/FilterPanel';
import TopicList from '../components/inbox/TopicList';
import ArticleList from '../components/inbox/ArticleList';
import GenerationPanel from '../components/inbox/GenerationPanel';
import ArticlePreview from '../components/inbox/ArticlePreview';

export default function InboxPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accountData, setAccountData] = useState(null);

  const [view, setView] = useState('topics');
  const [statusFilters, setStatusFilters] = useState([]);
  const [pillarFilters, setPillarFilters] = useState([]);

  const [topics, setTopics] = useState([]);
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);

  const [generating, setGenerating] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Load accounts on mount
  useEffect(() => {
    async function load() {
      try {
        const active = await window.electronAPI.accounts.listActive();
        setAccounts(active || []);
        if (active && active.length > 0 && !selectedAccount) {
          setSelectedAccount(active[0].id);
        }
      } catch {
        setAccounts([]);
      }
    }
    load();
  }, []);

  // Load account data when account changes
  useEffect(() => {
    if (!selectedAccount) {
      setAccountData(null);
      return;
    }
    async function load() {
      try {
        const data = await window.electronAPI.accounts.get(selectedAccount);
        setAccountData(data);
      } catch {
        setAccountData(null);
      }
    }
    load();
  }, [selectedAccount]);

  // Load data when account or view changes
  const loadData = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      if (view === 'topics') {
        const data = await window.electronAPI.topics.list(selectedAccount);
        setTopics(data || []);
      } else {
        const data = await window.electronAPI.articles.list(selectedAccount);
        setArticles(data || []);
      }
    } catch {
      if (view === 'topics') setTopics([]);
      else setArticles([]);
    }
  }, [selectedAccount, view]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusFilterChange = (status) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handlePillarFilterChange = (pillarId) => {
    setPillarFilters((prev) =>
      prev.includes(pillarId) ? prev.filter((p) => p !== pillarId) : [...prev, pillarId]
    );
  };

  // Apply filters
  const filteredTopics = topics.filter((t) => {
    if (statusFilters.length > 0 && !statusFilters.includes(t.status || 'pending')) return false;
    if (pillarFilters.length > 0 && !pillarFilters.includes(t.pillar)) return false;
    return true;
  });

  const filteredArticles = articles.filter((a) => {
    if (statusFilters.length > 0 && !statusFilters.includes(a.status)) return false;
    if (pillarFilters.length > 0 && !pillarFilters.includes(a.pillar)) return false;
    return true;
  });

  // Batch generation
  const handleGenerateClick = async () => {
    const pending = topics.filter((t) => (t.status || 'pending') === 'pending');
    setPendingCount(pending.length);
    setShowConfirm(true);
  };

  const handleGenerate = async () => {
    setShowConfirm(false);
    setGenerating(true);
    try {
      const result = await window.electronAPI.generator.run(selectedAccount);
      if (result.error) {
        showToast('生成エラー: ' + result.error, 'error');
        setGenerating(false);
        return;
      }
      if (result.batchId) {
        setBatchId(result.batchId);
      }
      showToast(`${result.articles?.length || 0}件の記事が生成されました`, 'success');
      setGenerating(false);
      setBatchId(null);
      // Switch to article view after generation
      setTimeout(() => {
        setView('articles');
        loadData();
      }, 3000);
    } catch (e) {
      showToast('生成に失敗しました', 'error');
      setGenerating(false);
    }
  };

  const handleGenerationComplete = () => {
    setGenerating(false);
    setBatchId(null);
    showToast('バッチ生成が完了しました', 'success');
    setTimeout(() => {
      setView('articles');
      loadData();
    }, 3000);
  };

  const handleArticleSelect = (article) => {
    setSelectedArticle(article);
  };

  const handleArticleUpdate = () => {
    loadData();
    // Refresh the selected article
    if (selectedArticle) {
      window.electronAPI.articles
        .get(selectedAccount, selectedArticle.id)
        .then((updated) => {
          if (updated) setSelectedArticle(updated);
        })
        .catch(() => {});
    }
  };

  const pillars = accountData?.pillars || [];
  const accountDisplayName =
    accounts.find((a) => a.id === selectedAccount)?.display_name || selectedAccount;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-0">
        <SetupBanner />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Filter Panel */}
        <FilterPanel
          accounts={accounts}
          selectedAccount={selectedAccount}
          onAccountChange={setSelectedAccount}
          view={view}
          onViewChange={setView}
          statusFilters={statusFilters}
          onStatusFilterChange={handleStatusFilterChange}
          pillars={pillars}
          pillarFilters={pillarFilters}
          onPillarFilterChange={handlePillarFilterChange}
          onRefresh={loadData}
        />

        {/* Center: List */}
        <div className="flex-1 overflow-y-auto">
          {/* Generation controls */}
          {view === 'topics' && (
            <div className="p-3 border-b border-gray-200 flex items-center gap-2">
              <button
                onClick={handleGenerateClick}
                disabled={generating || !selectedAccount}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? '生成中...' : 'バッチ生成を実行'}
              </button>
            </div>
          )}

          {/* Generation progress */}
          {generating && batchId && (
            <div className="p-3">
              <GenerationPanel
                batchId={batchId}
                onComplete={handleGenerationComplete}
              />
            </div>
          )}

          {/* Content */}
          <div>
            {view === 'topics' ? (
              <TopicList topics={filteredTopics} />
            ) : (
              <ArticleList
                articles={filteredArticles}
                selectedId={selectedArticle?.id}
                onSelect={handleArticleSelect}
              />
            )}
          </div>
        </div>

        {/* Right: Article Preview */}
        {selectedArticle && view === 'articles' && (
          <ArticlePreview
            article={selectedArticle}
            accountId={selectedAccount}
            onUpdate={handleArticleUpdate}
            onClose={() => setSelectedArticle(null)}
          />
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="バッチ生成を開始"
        message={`${accountDisplayName} のpendingテーマ ${pendingCount}件 でバッチ生成を開始しますか？\n※ Batch APIのため完了まで最大24時間かかります`}
        confirmText="生成開始"
        onConfirm={handleGenerate}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
