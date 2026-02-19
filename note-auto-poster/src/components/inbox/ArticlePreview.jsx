import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '../../hooks/useToast';

function PaidLineDivider() {
  return (
    <div className="border-t-2 border-orange-400 my-4 py-2 text-center text-sm text-orange-500">
      &#9986; ここから有料エリア
    </div>
  );
}

function MarkdownPreview({ body }) {
  if (!body) return <p className="text-gray-400 text-sm">本文がありません</p>;

  const parts = body.split('<!-- paid-line -->');

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{parts[0]}</ReactMarkdown>
      {parts.length > 1 && (
        <>
          <PaidLineDivider />
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parts.slice(1).join('')}</ReactMarkdown>
        </>
      )}
    </div>
  );
}

export default function ArticlePreview({ article, accountId, onUpdate, onClose, onRegenerate, regenerating }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState('preview');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(article.title);
  const [bodyValue, setBodyValue] = useState(article.body || '');
  const [saving, setSaving] = useState(false);
  const [rejected, setRejected] = useState(article.status === 'rejected');

  const handleTitleSave = async () => {
    setEditingTitle(false);
    if (titleValue === article.title) return;
    try {
      await window.electronAPI.articles.update(accountId, {
        ...article,
        title: titleValue,
      });
      showToast('タイトルを更新しました', 'success');
      onUpdate?.();
    } catch {
      showToast('更新に失敗しました', 'error');
    }
  };

  const handleBodySave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.articles.update(accountId, {
        ...article,
        body: bodyValue,
      });
      showToast('本文を保存しました', 'success');
      onUpdate?.();
    } catch {
      showToast('保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const now = new Date().toISOString();
      const updates = { ...article, status: newStatus };
      if (newStatus === 'reviewed') updates.reviewed_at = now;
      await window.electronAPI.articles.update(accountId, updates);
      await window.electronAPI.topics.updateStatus(accountId, article.id, newStatus);
      if (newStatus === 'rejected') {
        setRejected(true);
      } else {
        setRejected(false);
      }
      showToast(
        newStatus === 'reviewed' ? '記事を承認しました' : '記事を却下しました',
        'success'
      );
      onUpdate?.();
    } catch {
      showToast('更新に失敗しました', 'error');
    }
  };

  const handleEditClick = () => {
    setTab('markdown');
  };

  const tabs = [
    { id: 'preview', label: 'プレビュー' },
    { id: 'markdown', label: '編集' },
    { id: 'meta', label: 'メタ情報' },
  ];

  return (
    <div className="w-[400px] shrink-0 border-l border-gray-200 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          &#x2715; 閉じる
        </button>
        <span className="text-xs text-gray-400">ID: {article.id}</span>
      </div>

      {/* Title & Meta */}
      <div className="px-4 py-3 border-b border-gray-200 space-y-2">
        <div className="flex items-start gap-1">
          {editingTitle ? (
            <input
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              className="flex-1 text-sm font-bold border border-blue-300 rounded px-2 py-1"
              autoFocus
            />
          ) : (
            <>
              <span className="flex-1 text-sm font-bold text-gray-800">
                {article.title}
              </span>
              <button
                onClick={() => { setTitleValue(article.title); setEditingTitle(true); }}
                className="text-gray-400 hover:text-gray-600 text-xs shrink-0"
                title="タイトル編集"
              >
                &#9998;
              </button>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>柱: {article.pillar}</span>
          {article.pricing?.is_paid && (
            <span>
              &#128176; \u00A5{article.pricing.price?.toLocaleString()} | マガジン:{' '}
              {article.pricing.magazine}
            </span>
          )}
        </div>
        {article.tags && (
          <div className="flex flex-wrap gap-1">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2 text-sm ${
              tab === t.id
                ? 'text-blue-600 border-b-2 border-blue-600 font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rejected banner */}
      {rejected && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
          <p className="text-sm text-amber-800 font-medium mb-2">この記事は却下されました。次のアクションを選択してください：</p>
          <div className="flex gap-2">
            <button
              onClick={handleEditClick}
              className="flex-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              編集して修正
            </button>
            <button
              onClick={() => onRegenerate?.(article)}
              disabled={regenerating}
              className="flex-1 px-3 py-1.5 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {regenerating ? '再生成中...' : '再生成する'}
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'preview' && (
          <div>
            <MarkdownPreview body={article.body} />
            {article.body && !rejected && (
              <button
                onClick={handleEditClick}
                className="mt-4 px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                本文を編集する
              </button>
            )}
          </div>
        )}

        {tab === 'markdown' && (
          <div className="flex flex-col h-full gap-2">
            <textarea
              value={bodyValue}
              onChange={(e) => setBodyValue(e.target.value)}
              className="flex-1 w-full border border-gray-300 rounded p-2 text-sm font-mono resize-none min-h-[300px]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTab('preview')}
                className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                プレビューで確認
              </button>
              <button
                onClick={handleBodySave}
                disabled={saving}
                className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {tab === 'meta' && (
          <div className="text-sm space-y-2">
            <MetaRow label="ステータス" value={article.status} />
            <MetaRow
              label="生成日時"
              value={article.generated_at ? new Date(article.generated_at).toLocaleString() : '-'}
            />
            <MetaRow label="モデル" value={article.model || '-'} />
            <MetaRow
              label="トークン"
              value={
                article.token_usage
                  ? `入力${article.token_usage.input?.toLocaleString()} / 出力${article.token_usage.output?.toLocaleString()}`
                  : '-'
              }
            />
            <MetaRow label="バッチID" value={article.batch_id || '-'} />
            <MetaRow label="再生成回数" value={article.regenerate_count ?? 0} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-3 border-t border-gray-200">
        {rejected ? (
          <>
            <button
              onClick={() => handleStatusChange('reviewed')}
              className="flex-1 px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700"
            >
              承認に変更
            </button>
            <button
              onClick={() => onRegenerate?.(article)}
              disabled={regenerating}
              className="flex-1 px-3 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {regenerating ? '再生成中...' : '再生成'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleStatusChange('reviewed')}
              className="flex-1 px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700"
            >
              承認
            </button>
            <button
              onClick={handleEditClick}
              className="flex-1 px-3 py-2 text-sm rounded bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
            >
              編集
            </button>
            <button
              onClick={() => handleStatusChange('rejected')}
              className="flex-1 px-3 py-2 text-sm rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            >
              却下
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex">
      <span className="w-28 text-gray-500 shrink-0">{label}:</span>
      <span className="text-gray-800 break-all">{value}</span>
    </div>
  );
}
