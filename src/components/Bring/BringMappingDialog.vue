<!--
SPDX-FileCopyrightText: 2026 Nextcloud cookbook contributors

SPDX-License-Identifier: AGPL-3.0-only OR AGPL-3.0-or-later
-->

<template>
    <NcDialog
        :open="props.open"
        :name="t('cookbook', 'Export to Bring!')"
        size="large"
        content-classes="bring-mapping-dialog__content"
        @update:open="handleDialogUpdateOpen"
    >
        <!-- Login state -->
        <div v-if="view === 'login'" class="bring-mapping-dialog__login">
            <p class="bring-mapping-dialog__intro">
                {{
                    t(
                        'cookbook',
                        'Connect your Bring! account to add the ingredients of this recipe to one of your shopping lists.',
                    )
                }}
            </p>

            <NcTextField
                v-model="loginEmail"
                type="email"
                :label="t('cookbook', 'Bring! email address')"
                :disabled="isLoading"
                required
            />
            <NcPasswordField
                v-model="loginPassword"
                :label="t('cookbook', 'Password')"
                :disabled="isLoading"
            />

            <NcNoteCard
                v-if="errorMessage"
                type="error"
                :show-alert="true"
                :heading="t('cookbook', 'Connection failed')"
                :text="errorMessage"
            />
            <NcNoteCard
                v-else-if="reconnectRequired"
                type="warning"
                :show-alert="true"
                :heading="t('cookbook', 'Connection expired')"
                :text="
                    t(
                        'cookbook',
                        'Your Bring! connection has expired. Please connect again.',
                    )
                "
            />
        </div>

        <!-- Export / mapping state -->
        <div v-else-if="view === 'export'" class="bring-mapping-dialog__export">
            <div class="bring-mapping-dialog__options">
                <div class="bring-mapping-dialog__field">
                    <label for="bring-list-select">{{
                        t('cookbook', 'Shopping list')
                    }}</label>
                    <select
                        id="bring-list-select"
                        v-model="selectedListUuid"
                        :disabled="isLoading"
                        @change="handlePreviewRefresh"
                    >
                        <option
                            v-for="list in lists"
                            :key="list.listUuid"
                            :value="list.listUuid"
                        >
                            {{ list.name }}
                        </option>
                    </select>
                </div>

                <fieldset
                    class="bring-mapping-dialog__mode"
                    :disabled="isLoading"
                >
                    <legend>
                        {{ t('cookbook', 'How to add the ingredients') }}
                    </legend>
                    <label>
                        <input
                            v-model="mode"
                            type="radio"
                            value="merge"
                            @change="handlePreviewRefresh"
                        />
                        {{ t('cookbook', 'Merge into existing items') }}
                    </label>
                    <label>
                        <input
                            v-model="mode"
                            type="radio"
                            value="separate"
                            @change="handlePreviewRefresh"
                        />
                        {{ t('cookbook', 'Keep separate with recipe name') }}
                    </label>
                </fieldset>
            </div>

            <NcNoteCard
                v-if="errorMessage"
                type="error"
                :show-alert="true"
                :heading="t('cookbook', 'Preview failed')"
                :text="errorMessage"
            />

            <div
                v-if="isLoading && previewRows.length === 0"
                class="bring-mapping-dialog__loading"
            >
                <NcLoadingIcon />
                <span>{{
                    t('cookbook', 'Loading the preview from Bring!…')
                }}</span>
            </div>

            <div v-else class="bring-mapping-dialog__table-wrap">
                <table class="bring-mapping-dialog__table">
                    <thead>
                        <tr>
                            <th scope="col" class="col-enabled">
                                <span
                                    class="bring-mapping-dialog__visually-hidden"
                                    >{{ t('cookbook', 'Include') }}</span
                                >
                            </th>
                            <th scope="col">
                                {{ t('cookbook', 'Ingredient') }}
                            </th>
                            <th scope="col">{{ t('cookbook', 'Quantity') }}</th>
                            <th scope="col">{{ t('cookbook', 'Action') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in previewRows" :key="row.index">
                            <td class="col-enabled">
                                <input
                                    v-model="itemEnabledMap[row.index]"
                                    type="checkbox"
                                    :aria-label="
                                        t('cookbook', 'Include {ingredient}', {
                                            ingredient: row.name,
                                        })
                                    "
                                />
                            </td>
                            <td class="col-name">
                                <select
                                    v-if="row.alternatives.length > 1"
                                    v-model="itemSelectionMap[row.index]"
                                    class="bring-mapping-dialog__alternative"
                                    :aria-label="
                                        t(
                                            'cookbook',
                                            'Choose an alternative for {ingredient}',
                                            { ingredient: row.name },
                                        )
                                    "
                                    @change="handlePreviewRefresh"
                                >
                                    <option
                                        v-for="alternative in row.alternatives"
                                        :key="alternative"
                                        :value="alternative"
                                    >
                                        {{ alternative }}
                                    </option>
                                </select>
                                <span v-else>{{ row.name }}</span>
                            </td>
                            <td class="col-spec">{{ row.resultSpec }}</td>
                            <td class="col-action">
                                <span
                                    class="bring-mapping-dialog__badge"
                                    :class="`bring-mapping-dialog__badge--${row.action}`"
                                >
                                    {{ actionLabel(row.action) }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Success state -->
        <div v-else class="bring-mapping-dialog__success">
            <CheckIcon class="bring-mapping-dialog__success-icon" />
            <p>{{ successMessage }}</p>
        </div>

        <template #actions>
            <NcButton
                v-if="view === 'login'"
                variant="primary"
                :disabled="isLoading"
                @click="handleLogin"
            >
                <NcLoadingIcon v-if="isLoading" />
                {{ t('cookbook', 'Connect') }}
            </NcButton>

            <template v-else-if="view === 'export'">
                <NcButton
                    variant="primary"
                    :disabled="enabledCount === 0 || isLoading"
                    @click="handleExport"
                >
                    <NcLoadingIcon v-if="isLoading" />
                    {{ exportLabel }}
                </NcButton>
                <NcButton
                    variant="tertiary"
                    :disabled="isLoading"
                    @click="handleDisconnect"
                >
                    {{ t('cookbook', 'Disconnect account') }}
                </NcButton>
            </template>

            <NcButton v-else variant="primary" @click="handleClose">
                {{ t('cookbook', 'Close') }}
            </NcButton>

            <NcButton
                v-if="view !== 'success'"
                variant="secondary"
                :disabled="isLoading"
                @click="handleClose"
            >
                {{ t('cookbook', 'Cancel') }}
            </NcButton>
        </template>
    </NcDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    NcButton,
    NcDialog,
    NcLoadingIcon,
    NcNoteCard,
    NcPasswordField,
    NcTextField,
} from '@nextcloud/vue';
import CheckIcon from 'vue-material-design-icons/Check.vue';
import {
    useBring,
    type BringExportMode,
    type BringItemRow,
} from '../../composables/useBring';

const t = window.t;
const n = window.n;

interface Props {
    open?: boolean;
    recipeName?: string;
    ingredients?: string[];
}

const props = withDefaults(defineProps<Props>(), {
    open: false,
    recipeName: '',
    ingredients: () => [],
});

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
    (e: 'close'): void;
    (e: 'exported', count: number): void;
}>();

const {
    lists,
    selectedListUuid,
    previewRows,
    isLoading,
    errorMessage,
    reconnectRequired,
    checkStatus,
    login,
    disconnect,
    loadLists,
    loadPreview,
    exportToBring,
} = useBring();

type View = 'login' | 'export' | 'success';

const view = ref<View>('login');
const mode = ref<BringExportMode>('merge');
const loginEmail = ref('');
const loginPassword = ref('');
const exportedCount = ref(0);
const exportedListName = ref('');
const itemSelectionMap = ref<Record<number, string>>({});
const itemEnabledMap = ref<Record<number, boolean>>({});

/**
 * Number of rows the user wants to include in the export.
 */
const enabledCount = computed(() =>
    previewRows.value.reduce(
        (sum, row) =>
            sum + ((itemEnabledMap.value[row.index] ?? row.enabled) ? 1 : 0),
        0,
    ),
);

const currentListName = computed(
    () =>
        lists.value.find((list) => list.listUuid === selectedListUuid.value)
            ?.name ?? '',
);

const exportLabel = computed(() =>
    n(
        'cookbook',
        'Export ({n} item)',
        'Export ({n} items)',
        enabledCount.value,
        { n: enabledCount.value },
    ),
);

const successMessage = computed(() =>
    n(
        'cookbook',
        '{n} ingredient exported to the Bring! list "{list}"',
        '{n} ingredients exported to the Bring! list "{list}"',
        exportedCount.value,
        { n: exportedCount.value, list: exportedListName.value },
    ),
);

function resetLocalState(): void {
    view.value = 'login';
    mode.value = 'merge';
    loginEmail.value = '';
    loginPassword.value = '';
    exportedCount.value = 0;
    exportedListName.value = '';
    itemSelectionMap.value = {};
    itemEnabledMap.value = {};
}

/**
 * Request a fresh preview and fill the local maps with the server defaults.
 */
async function refreshPreview(): Promise<void> {
    const rows = await loadPreview(
        props.recipeName,
        props.ingredients,
        mode.value,
        itemSelectionMap.value,
        itemEnabledMap.value,
    );

    rows.forEach((row) => {
        if (itemEnabledMap.value[row.index] === undefined) {
            itemEnabledMap.value[row.index] = row.enabled;
        }
        if (itemSelectionMap.value[row.index] === undefined) {
            itemSelectionMap.value[row.index] = row.name;
        }
    });
}

async function openExportView(): Promise<void> {
    view.value = 'export';
    await loadLists();
    if (selectedListUuid.value !== '') {
        await refreshPreview();
    }
}

async function handleLogin(): Promise<void> {
    if (isLoading.value || loginEmail.value === '') {
        return;
    }

    const connected = await login(loginEmail.value, loginPassword.value);
    if (!connected) {
        return;
    }
    loginPassword.value = '';
    await openExportView();
}

async function handleDisconnect(): Promise<void> {
    const success = await disconnect();
    if (success) {
        resetLocalState();
    }
}

function handleClose(): void {
    emit('update:open', false);
    emit('close');
}

async function handleExport(): Promise<void> {
    if (isLoading.value || enabledCount.value === 0) {
        return;
    }

    const written = await exportToBring(
        props.recipeName,
        props.ingredients,
        mode.value,
        itemSelectionMap.value,
        itemEnabledMap.value,
    );
    if (errorMessage.value !== null) {
        return;
    }

    exportedCount.value = written;
    exportedListName.value = currentListName.value;
    view.value = 'success';
    emit('exported', written);
}

async function handlePreviewRefresh(): Promise<void> {
    if (isLoading.value || selectedListUuid.value === '') {
        return;
    }
    await refreshPreview();
}

function handleDialogUpdateOpen(value: boolean): void {
    if (!value) {
        handleClose();
    }
}

function actionLabel(action: BringItemRow['action']): string {
    switch (action) {
        case 'add':
            return t('cookbook', 'Add');
        case 'readd':
            return t('cookbook', 'Re-add');
        case 'sum':
            return t('cookbook', 'Sum up');
        case 'update':
            return t('cookbook', 'Update');
        case 'unchanged':
            return t('cookbook', 'Unchanged');
        case 'skipped':
            return t('cookbook', 'Skipped');
    }
}

watch(
    () => props.open,
    async (open) => {
        if (!open) {
            return;
        }
        resetLocalState();
        errorMessage.value = null;
        reconnectRequired.value = false;
        const connected = await checkStatus();
        if (connected) {
            await openExportView();
        }
    },
    // Also initialize when the dialog is mounted already open (v-if + open pattern).
    { immediate: true },
);

// If a request reports an expired connection, fall back to the login view.
watch(reconnectRequired, (needed) => {
    if (needed) {
        view.value = 'login';
    }
});
</script>

<style lang="scss" scoped>
.bring-mapping-dialog__content {
    max-height: 80vh;
    overflow-y: auto;
}

.bring-mapping-dialog__intro {
    margin-bottom: 16px;
}

.bring-mapping-dialog__login,
.bring-mapping-dialog__export {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.bring-mapping-dialog__options {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px;

    .bring-mapping-dialog__field {
        display: flex;
        flex-direction: column;
        gap: 4px;

        select {
            min-width: 200px;
            max-width: 300px;
            padding: 6px 8px;
            border: 1px solid var(--color-border-maxcontrast);
            border-radius: var(--border-radius);
            background-color: var(--color-main-background);
            color: var(--color-main-text);
        }
    }

    .bring-mapping-dialog__mode {
        display: flex;
        flex-direction: column;
        padding: 8px 12px;
        border: 1px solid var(--color-border-maxcontrast);
        border-radius: var(--border-radius);
        margin: 0;
        gap: 4px;

        legend {
            padding: 0 4px;
            color: var(--color-text-maxcontrast);
            font-size: 12px;
        }

        label {
            display: flex;
            align-items: center;
            gap: 6px;
        }
    }
}

.bring-mapping-dialog__loading {
    display: flex;
    align-items: center;
    padding: 24px 0;
    gap: 12px;
}

.bring-mapping-dialog__table-wrap {
    overflow-x: auto;
}

.bring-mapping-dialog__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;

    th,
    td {
        padding: 8px 6px;
        border-bottom: 1px solid var(--color-border);
        text-align: start;
        vertical-align: middle;
    }

    th {
        color: var(--color-text-maxcontrast);
        font-weight: bold;
    }

    .col-enabled {
        width: 40px;
    }

    .col-name {
        min-width: 180px;
        overflow-wrap: break-word;
    }

    .col-spec {
        min-width: 140px;
        overflow-wrap: break-word;
    }

    .col-action {
        width: 110px;
    }

    .bring-mapping-dialog__alternative {
        max-width: 240px;
        padding: 4px 6px;
        border: 1px solid var(--color-border-maxcontrast);
        border-radius: var(--border-radius);
        background-color: var(--color-main-background);
        color: var(--color-main-text);
    }
}

.bring-mapping-dialog__badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    background-color: var(--color-background-dark);
    color: var(--color-text-maxcontrast);
    font-size: 12px;

    &--add,
    &--readd {
        background-color: var(--color-success);
        color: var(--color-text-on-primary);
    }

    &--sum,
    &--update {
        background-color: var(--color-primary-element);
        color: var(--color-text-on-primary);
    }

    &--skipped {
        opacity: 0.7;
    }
}

.bring-mapping-dialog__success {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0;
    gap: 12px;
    text-align: center;
}

.bring-mapping-dialog__success-icon {
    width: 48px;
    height: 48px;
    color: var(--color-success);
}

.bring-mapping-dialog__visually-hidden {
    position: absolute;
    overflow: hidden;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    white-space: nowrap;
}
</style>
