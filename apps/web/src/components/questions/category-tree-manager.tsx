'use client';
import { formatNumber } from '@/lib/utils';

import { ChevronDown, ChevronRight, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type TreeRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  position: number;
  isActive: boolean;
  parentId: string | null;
  questionCount: number;
  leafCount: number;
  descendantCount: number;
  children: TreeRow[];
};

type FlatRow = TreeRow & { depth: number };

type CategoryFormState = {
  open: boolean;
  mode: 'create' | 'edit';
  parentId: string | null;
  category: TreeRow | null;
};

const emptyForm: CategoryFormState = {
  open: false,
  mode: 'create',
  parentId: null,
  category: null,
};

type FlashState = { type: 'success' | 'error'; message: string } | null;

export function CategoryTreeManager({
  initialTree,
  initialFlat,
}: {
  initialTree: TreeRow[];
  initialFlat: FlatRow[];
}) {
  const router = useRouter();
  const [tree, setTree] = useState<TreeRow[]>(initialTree);
  const [flat, setFlat] = useState<FlatRow[]>(initialFlat);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialTree.map((node) => node.id)),
  );
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<FlashState>(null);

  const lookup = useMemo(() => new Map(flat.map((row) => [row.id, row])), [flat]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: string | null = null) => {
    setForm({ open: true, mode: 'create', parentId, category: null });
    setFlash(null);
  };

  const openEdit = (category: TreeRow) => {
    setForm({ open: true, mode: 'edit', parentId: category.parentId, category });
    setFlash(null);
  };

  const closeForm = () => setForm(emptyForm);

  const refreshFromServer = async () => {
    const response = await fetch('/api/admin/questions/categories', { method: 'GET' });
    const data = (await response.json().catch(() => null)) as
      | { ok: true; tree: TreeRow[]; flat: FlatRow[] }
      | { ok: false; message?: string }
      | null;
    if (data && 'ok' in data && data.ok) {
      setTree(data.tree);
      setFlat(data.flat);
    } else {
      setFlash({ type: 'error', message: data && 'message' in data ? data.message ?? 'تعذّر التحديث.' : 'تعذّر التحديث.' });
    }
  };

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim() || null,
      description: String(formData.get('description') ?? '').trim() || null,
      icon: String(formData.get('icon') ?? '').trim() || null,
      parentId: form.mode === 'create' ? form.parentId : String(formData.get('parentId') ?? '') || null,
      position: Number.parseInt(String(formData.get('position') ?? '0'), 10) || 0,
      isActive: formData.get('isActive') === 'on',
    };

    if (payload.name.length < 2) {
      setFlash({ type: 'error', message: 'اسم التصنيف قصير جدًا.' });
      return;
    }

    const url =
      form.mode === 'create'
        ? '/api/admin/questions/categories'
        : `/api/admin/questions/categories/${form.category?.id ?? ''}`;
    const method = form.mode === 'create' ? 'POST' : 'PATCH';
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as
      | { ok: true; category: TreeRow }
      | { ok: false; message?: string }
      | null;
    if (data && 'ok' in data && data.ok) {
      setFlash({ type: 'success', message: form.mode === 'create' ? 'تم إنشاء التصنيف.' : 'تم تحديث التصنيف.' });
      closeForm();
      await refreshFromServer();
      startTransition(() => router.refresh());
    } else {
      setFlash({ type: 'error', message: data && 'message' in data ? data.message ?? 'فشل الحفظ.' : 'فشل الحفظ.' });
    }
  };

  const remove = async (category: TreeRow) => {
    const confirmed = typeof window !== 'undefined' && window.confirm(`حذف التصنيف «${category.name}»؟ سيتم رفض الحذف إن كان يحتوي فئات فرعية أو أسئلة.`);
    if (!confirmed) return;
    const response = await fetch(`/api/admin/questions/categories/${category.id}`, { method: 'DELETE' });
    const data = (await response.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message?: string }
      | null;
    if (data && 'ok' in data && data.ok) {
      setFlash({ type: 'success', message: 'تم حذف التصنيف.' });
      await refreshFromServer();
      startTransition(() => router.refresh());
    } else {
      setFlash({ type: 'error', message: data && 'message' in data ? data.message ?? 'فشل الحذف.' : 'فشل الحذف.' });
    }
  };

  return (
    <section className="category-tree-manager" aria-labelledby="category-tree-title">
      <header className="category-tree-header">
        <div className="category-tree-header-info">
          <h2 id="category-tree-title">
            <FolderTree aria-hidden /> شجرة التصنيفات
          </h2>
          <p className="category-tree-subtitle">
            أضف فئات جديدة، عدّل الأسماء، أو انقل الأسئلة بين الفئات. الخادم هو المرجع للتحقق من التداخل والحذف.
          </p>
        </div>
        <div className="category-tree-header-actions">
          <button type="button" onClick={() => openCreate(null)} className="btn btn-primary">
            <Plus aria-hidden /> إضافة فئة جذر
          </button>
        </div>
      </header>

      {flash && (
        <div
          role={flash.type === 'error' ? 'alert' : 'status'}
          className={`flash flash-${flash.type}`}
        >
          {flash.message}
        </div>
      )}

      <div className="category-tree-stats" aria-label="إحصائيات الشجرة">
        <span>إجمالي الفئات: {formatNumber(flat.length)}</span>
        <span>الفئات الجذر: {formatNumber(tree.length)}</span>
        <span>أعمق مستوى: {formatNumber(flat.reduce((max, row) => Math.max(max, row.depth), 0))}</span>
        <span>الأسئلة المسجلة: {formatNumber(flat.reduce((sum, row) => sum + row.questionCount, 0))}</span>
      </div>

      {tree.length === 0 ? (
        <p className="empty-state">لا توجد فئات بعد. ابدأ بإضافة فئة جذر.</p>
      ) : (
        <ul className="category-tree" role="tree">
          {tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onAddChild={openCreate}
              onEdit={openEdit}
              onRemove={remove}
              allCategories={flat}
            />
          ))}
        </ul>
      )}

      {form.open && (
        <CategoryFormDialog
          form={form}
          lookup={lookup}
          onClose={closeForm}
          onSubmit={submitForm}
          pending={pending}
        />
      )}
    </section>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
  onRemove,
  allCategories,
}: {
  node: TreeRow;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (category: TreeRow) => void;
  onRemove: (category: TreeRow) => void;
  allCategories: FlatRow[];
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <li role="treeitem" aria-selected={false} aria-expanded={hasChildren ? isOpen : undefined} className="category-tree-row">
      <div className="category-tree-line" style={{ paddingInlineStart: `${depth * 1.5}rem` }}>
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className="category-tree-toggle"
          aria-label={isOpen ? 'طي الفرع' : 'فتح الفرع'}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isOpen ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />
          ) : (
            <span className="category-tree-leaf-dot" aria-hidden />
          )}
        </button>
        <span className="category-tree-icon" aria-hidden>{node.icon ?? '📁'}</span>
        <span className="category-tree-name">{node.name}</span>
        <span className="category-tree-meta">
          {formatNumber(node.questionCount)} سؤال
          {node.descendantCount > 0 ? ` • ${formatNumber(node.descendantCount)} فئة فرعية` : ''}
        </span>
        <span className={`category-tree-status ${node.isActive ? 'is-active' : 'is-inactive'}`}>
          {node.isActive ? 'مفعل' : 'متوقف'}
        </span>
        <div className="category-tree-actions">
          <button type="button" onClick={() => onAddChild(node.id)} className="btn btn-ghost btn-sm" title="إضافة فئة فرعية">
            <Plus aria-hidden /> فرعي
          </button>
          <button type="button" onClick={() => onEdit(node)} className="btn btn-ghost btn-sm" title="تعديل">
            <Pencil aria-hidden /> تعديل
          </button>
          <button type="button" onClick={() => onRemove(node)} className="btn btn-ghost btn-sm btn-danger" title="حذف">
            <Trash2 aria-hidden />
          </button>
        </div>
      </div>
      {hasChildren && isOpen && (
        <ul className="category-tree" role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onRemove={onRemove}
              allCategories={allCategories}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CategoryFormDialog({
  form,
  lookup,
  onClose,
  onSubmit,
  pending,
}: {
  form: CategoryFormState;
  lookup: Map<string, FlatRow>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean;
}) {
  const editing = form.mode === 'edit';
  const current = form.category;
  const initialParent = editing ? current?.parentId ?? null : form.parentId;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
        aria-labelledby="category-form-title"
      >
        <header className="modal-header">
          <h3 id="category-form-title">{editing ? 'تعديل التصنيف' : 'إضافة تصنيف'}</h3>
        </header>
        <div className="modal-body">
          <label className="form-field">
            <span>الاسم</span>
            <input
              type="text"
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={editing ? current?.name ?? '' : ''}
            />
          </label>
          <label className="form-field">
            <span>المعرف اللطيف (slug)</span>
            <input
              type="text"
              name="slug"
              maxLength={120}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              placeholder="مثال: history"
              defaultValue={editing ? current?.slug ?? '' : ''}
            />
          </label>
          <label className="form-field">
            <span>الأيقونة (إيموجي)</span>
            <input
              type="text"
              name="icon"
              maxLength={40}
              defaultValue={editing ? current?.icon ?? '' : ''}
            />
          </label>
          <label className="form-field">
            <span>الوصف</span>
            <textarea
              name="description"
              maxLength={500}
              rows={3}
              defaultValue={editing ? current?.description ?? '' : ''}
            />
          </label>
          <label className="form-field">
            <span>الترتيب</span>
            <input
              type="number"
              name="position"
              min={0}
              max={10000}
              defaultValue={editing ? current?.position ?? 0 : 0}
            />
          </label>
          <label className="form-field">
            <span>الفئة الأب</span>
            <select name="parentId" defaultValue={initialParent ?? ''}>
              <option value="">— جذر (بدون أب) —</option>
              {Array.from(lookup.values())
                .filter((row) => (editing ? row.id !== current?.id : true))
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {'— '.repeat(row.depth)}
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-field form-field-inline">
            <input type="checkbox" name="isActive" defaultChecked={editing ? current?.isActive ?? true : true} />
            <span>مفعل ومتاح للاختيار</span>
          </label>
        </div>
        <footer className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {editing ? 'حفظ التغييرات' : 'إضافة التصنيف'}
          </button>
        </footer>
      </form>
    </div>
  );
}
