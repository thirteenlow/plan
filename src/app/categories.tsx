import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PickerSheet, Sheet } from '@/components/Sheet';
import { Button, Card, Chip, confirm, Divider, IconBadge, IconButton, Row, Tap, TextField, Toggle, Txt } from '@/components/ui';
import { sortedGroups } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import type { BudgetData, Category, CategoryGroup } from '@/store/types';
import { useTheme } from '@/theme';
import { LIMITS, validateName } from '@/utils/validation';

type NameSheet = { mode: 'addGroup' } | { mode: 'addCategory'; groupId: string } | null;
type DeleteTarget = { kind: 'category'; category: Category } | { kind: 'group'; group: CategoryGroup } | null;

const hasHistory = (data: BudgetData, ids: string[]) => {
  const set = new Set(ids);
  return (
    data.transactions.some((t) => (t.categoryId && set.has(t.categoryId)) || t.subtransactions?.some((x) => x.categoryId && set.has(x.categoryId))) ||
    data.scheduled.some((x) => x.categoryId && set.has(x.categoryId)) ||
    Object.values(data.assigned).some((row) => ids.some((id) => row[id]))
  );
};

export default function CategoriesScreen() {
  const data = useActiveBudget();
  const s = useStore.getState();
  const { colors } = useTheme();
  const [nameSheet, setNameSheet] = useState<NameSheet>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editGroup, setEditGroup] = useState<CategoryGroup | null>(null);
  const [toDelete, setToDelete] = useState<DeleteTarget>(null);
  const groups = sortedGroups(data, true);

  const openName = (e: NameSheet) => {
    setText('');
    setError(null);
    setNameSheet(e);
  };
  const submitName = () => {
    if (!nameSheet) return;
    const isGroup = nameSheet.mode === 'addGroup';
    const existing = isGroup ? data.groups.map((g) => g.name) : data.categories.filter((c) => c.groupId === nameSheet.groupId).map((c) => c.name);
    const err = validateName(text, { label: isGroup ? 'Group' : 'Category', max: isGroup ? LIMITS.groupName : LIMITS.categoryName, existing });
    setError(err);
    if (err) return;
    if (isGroup) s.addGroup(text);
    else s.addCategory(nameSheet.groupId, text);
    setNameSheet(null);
  };

  /** Deletes straight away when nothing uses it; otherwise asks where its history should go. */
  const requestDelete = async (target: NonNullable<DeleteTarget>) => {
    setEditCat(null);
    setEditGroup(null);
    const ids = target.kind === 'category' ? [target.category.id] : data.categories.filter((c) => c.groupId === target.group.id).map((c) => c.id);
    const name = target.kind === 'category' ? target.category.name : target.group.name;
    if (hasHistory(data, ids)) {
      setToDelete(target);
      return;
    }
    const what = target.kind === 'group' && ids.length ? `“${name}” and its ${ids.length} categor${ids.length === 1 ? 'y' : 'ies'}` : `“${name}”`;
    if (await confirm(target.kind === 'group' ? 'Delete group' : 'Delete category', `Delete ${what}? This can’t be undone.`, 'Delete', true)) {
      if (target.kind === 'category') s.deleteCategory(target.category.id);
      else s.deleteGroupWithCategories(target.group.id, null);
    }
  };

  const deletingIds = toDelete ? (toDelete.kind === 'category' ? [toDelete.category.id] : data.categories.filter((c) => c.groupId === toDelete.group.id).map((c) => c.id)) : [];

  return (
    <Screen back="back" title="Categories" subtitle="Add, edit, reorder, hide and delete" right={<IconButton icon="add" label="Add group" onPress={() => openName({ mode: 'addGroup' })} />}>
      {groups.map(({ group, categories }, gi) => (
        <View key={group.id} style={{ marginTop: gi ? 20 : 4, opacity: group.hidden ? 0.55 : 1 }}>
          <Row style={{ gap: 4, marginBottom: 8 }}>
            <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
              {group.name}
              {group.hidden ? '  (hidden)' : ''}
            </Txt>
            <IconButton icon="arrow-up" label={`Move ${group.name} up`} tone="plain" size={32} onPress={() => s.moveGroup(group.id, -1)} />
            <IconButton icon="arrow-down" label={`Move ${group.name} down`} tone="plain" size={32} onPress={() => s.moveGroup(group.id, 1)} />
            {!group.isCreditCardPayments && (
              <>
                <IconButton icon="create-outline" label={`Edit ${group.name}`} tone="plain" size={32} onPress={() => setEditGroup(group)} />
                <IconButton icon="trash-outline" label={`Delete ${group.name}`} tone="plain" size={32} color={colors.danger} onPress={() => requestDelete({ kind: 'group', group })} />
              </>
            )}
          </Row>
          <Card style={{ paddingVertical: 4 }}>
            {categories.map((c, i) => (
              <View key={c.id}>
                {i > 0 && <Divider inset={46} />}
                <Row style={{ gap: 6, paddingVertical: 10, opacity: c.hidden ? 0.5 : 1 }}>
                  <IconBadge name={c.name} icon={c.linkedAccountId ? 'card' : undefined} size={34} />
                  <Tap style={{ flex: 1, marginLeft: 4 }} disabled={!!c.linkedAccountId} onPress={() => setEditCat(c)} accessibilityRole="button" accessibilityLabel={`Edit ${c.name}`}>
                    <Txt variant="body" numberOfLines={1}>
                      {c.name}
                    </Txt>
                    {(c.hidden || c.linkedAccountId) && (
                      <Txt variant="caption" tone="muted">
                        {c.linkedAccountId ? 'Linked to its card' : 'Hidden'}
                      </Txt>
                    )}
                  </Tap>
                  <IconButton icon="chevron-up" label={`Move ${c.name} up`} tone="plain" size={32} onPress={() => s.moveCategory(c.id, -1)} />
                  <IconButton icon="chevron-down" label={`Move ${c.name} down`} tone="plain" size={32} onPress={() => s.moveCategory(c.id, 1)} />
                  {!c.linkedAccountId && (
                    <>
                      <IconButton icon="create-outline" label={`Edit ${c.name}`} tone="plain" size={32} onPress={() => setEditCat(c)} />
                      <IconButton icon="trash-outline" label={`Delete ${c.name}`} tone="plain" size={32} color={colors.danger} onPress={() => requestDelete({ kind: 'category', category: c })} />
                    </>
                  )}
                </Row>
              </View>
            ))}
            {!group.isCreditCardPayments && (
              <>
                {categories.length > 0 && <Divider />}
                <Tap onPress={() => openName({ mode: 'addCategory', groupId: group.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                  <Txt variant="label" tone="accent">
                    Add category
                  </Txt>
                </Tap>
              </>
            )}
          </Card>
        </View>
      ))}
      <Button title="Add category group" variant="soft" icon="add" style={{ marginTop: 20 }} onPress={() => openName({ mode: 'addGroup' })} />

      <Sheet visible={!!nameSheet} onClose={() => setNameSheet(null)} title={nameSheet?.mode === 'addGroup' ? 'New group' : 'New category'}>
        <TextField value={text} onChangeText={setText} maxLength={LIMITS.categoryName} error={error} autoFocus placeholder="Name" onSubmitEditing={submitName} returnKeyType="done" />
        <Button title="Add" style={{ marginTop: 14 }} disabled={!text.trim()} onPress={submitName} />
      </Sheet>

      {editCat && <CategoryEditor key={editCat.id} category={editCat} onClose={() => setEditCat(null)} onDelete={() => requestDelete({ kind: 'category', category: editCat })} />}
      {editGroup && <GroupEditor key={editGroup.id} group={editGroup} onClose={() => setEditGroup(null)} onDelete={() => requestDelete({ kind: 'group', group: editGroup })} />}

      <PickerSheet
        visible={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Move history to…"
        items={[
          { key: '__none__', title: 'Leave uncategorized', subtitle: 'Transactions will need a new category later', section: 'Option' },
          ...data.categories
            .filter((c) => !deletingIds.includes(c.id) && !c.linkedAccountId)
            .map((c) => ({ key: c.id, title: c.name, section: data.groups.find((g) => g.id === c.groupId)?.name, left: <IconBadge name={c.name} size={30} /> })),
        ]}
        onSelect={async (key) => {
          const target = toDelete!;
          setToDelete(null);
          const replacement = key === '__none__' ? null : key;
          const dest = replacement ? `“${data.categories.find((c) => c.id === replacement)?.name}”` : 'no category';
          const name = target.kind === 'category' ? target.category.name : target.group.name;
          if (await confirm(target.kind === 'group' ? 'Delete group' : 'Delete category', `Transactions and assigned money from “${name}” will move to ${dest}. This can’t be undone.`, 'Delete', true)) {
            if (target.kind === 'category') s.deleteCategory(target.category.id, replacement);
            else s.deleteGroupWithCategories(target.group.id, replacement);
          }
        }}
      />
    </Screen>
  );
}

function CategoryEditor({ category, onClose, onDelete }: { category: Category; onClose: () => void; onDelete: () => void }) {
  const data = useActiveBudget();
  const updateCategory = useStore((st) => st.updateCategory);
  const [name, setName] = useState(category.name);
  const [groupId, setGroupId] = useState(category.groupId);
  const [hidden, setHidden] = useState(category.hidden);
  const [error, setError] = useState<string | null>(null);
  const groups = data.groups.filter((g) => !g.isCreditCardPayments).sort((a, b) => a.sort - b.sort);

  const save = () => {
    const err = validateName(name, {
      label: 'Category',
      max: LIMITS.categoryName,
      existing: data.categories.filter((c) => c.groupId === groupId && c.id !== category.id).map((c) => c.name),
    });
    setError(err);
    if (err) return;
    updateCategory(category.id, { name, groupId, hidden });
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title="Edit category">
      <TextField label="Name" value={name} onChangeText={setName} maxLength={LIMITS.categoryName} error={error} autoFocus />
      <Txt variant="label" tone="soft" style={{ marginTop: 16, marginBottom: 8, marginLeft: 4 }}>
        Group
      </Txt>
      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
        {groups.map((g) => (
          <Chip key={g.id} label={g.name} active={g.id === groupId} onPress={() => setGroupId(g.id)} />
        ))}
      </Row>
      <Card style={{ marginTop: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="body">Hide category</Txt>
            <Txt variant="caption" tone="muted">
              Hidden categories keep their history but leave your plan.
            </Txt>
          </View>
          <Toggle label="Hide category" value={hidden} onChange={setHidden} />
        </Row>
      </Card>
      <Button title="Save" style={{ marginTop: 16 }} disabled={!name.trim()} onPress={save} />
      <Button title="Delete category" variant="danger" icon="trash-outline" style={{ marginTop: 10 }} onPress={onDelete} />
    </Sheet>
  );
}

function GroupEditor({ group, onClose, onDelete }: { group: CategoryGroup; onClose: () => void; onDelete: () => void }) {
  const data = useActiveBudget();
  const { renameGroup, setGroupHidden } = useStore.getState();
  const [name, setName] = useState(group.name);
  const [hidden, setHidden] = useState(group.hidden);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const err = validateName(name, { label: 'Group', max: LIMITS.groupName, existing: data.groups.filter((g) => g.id !== group.id).map((g) => g.name) });
    setError(err);
    if (err) return;
    renameGroup(group.id, name);
    if (hidden !== group.hidden) setGroupHidden(group.id, hidden);
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title="Edit group">
      <TextField label="Name" value={name} onChangeText={setName} maxLength={LIMITS.groupName} error={error} autoFocus />
      <Card style={{ marginTop: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="body" style={{ flex: 1 }}>
            Hide group
          </Txt>
          <Toggle label="Hide group" value={hidden} onChange={setHidden} />
        </Row>
      </Card>
      <Button title="Save" style={{ marginTop: 16 }} disabled={!name.trim()} onPress={save} />
      <Button title="Delete group" variant="danger" icon="trash-outline" style={{ marginTop: 10 }} onPress={onDelete} />
    </Sheet>
  );
}
