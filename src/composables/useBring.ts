// SPDX-FileCopyrightText: 2026 Nextcloud cookbook contributors
//
// SPDX-License-Identifier: AGPL-3.0-only OR AGPL-3.0-or-later

/**
 * useBring — Bring! connection state and client
 *
 * Frontend wrapper for the PHP Bring! endpoints (lib/Controller/BringController.php).
 *
 * Usage:
 *   const { isConnected, login, loadPreview, exportToBring } = useBring()
 */

import axios from '@nextcloud/axios';
import { generateUrl } from '@nextcloud/router';
import { ref } from 'vue';

const t = window.t;

const BASE_URL = `${generateUrl('apps/cookbook')}/webapp/bring`;

/**
 * A Bring! shopping list.
 */
export interface BringList {
	listUuid: string;
	name: string;
}

/**
 * One planned item as returned by the preview and export endpoints.
 */
export interface BringItemRow {
	index: number;
	original: string;
	name: string;
	alternatives: string[];
	isStaple: boolean;
	enabled: boolean;
	action: 'add' | 'readd' | 'sum' | 'update' | 'unchanged' | 'skipped';
	itemId: string;
	existingSpec: string | null;
	resultSpec: string;
}

/**
 * One ingredient line sent to the preview and export endpoints.
 */
export interface BringItemPayload {
	line: string;
	name?: string;
	enabled?: boolean;
}

/**
 * How the ingredients should be merged into the Bring! list.
 */
export type BringExportMode = 'merge' | 'separate';

/**
 * Extract the server error message, falling back to a translated default.
 */
function extractMessage(error: unknown, fallback: string): string {
	const data = (error as { response?: { data?: { message?: unknown } } })
		?.response?.data;
	if (typeof data?.message === 'string' && data.message !== '') {
		return data.message;
	}
	return fallback;
}

export function useBring() {
	const isConnected = ref(false);
	const userEmail = ref('');
	const lists = ref<BringList[]>([]);
	const selectedListUuid = ref('');
	const previewRows = ref<BringItemRow[]>([]);
	const isLoading = ref(false);
	const errorMessage = ref<string | null>(null);
	const reconnectRequired = ref(false);

	/**
	 * Remember a failed request: show the server message and flag a lost connection.
	 */
	function handleRequestError(error: unknown, fallback: string): void {
		const data = (
			error as {
				response?: {
					data?: { message?: unknown; reconnect?: unknown };
				};
			}
		)?.response?.data;
		errorMessage.value =
			typeof data?.message === 'string' && data.message !== ''
				? data.message
				: fallback;
		if (data?.reconnect === true) {
			reconnectRequired.value = true;
			isConnected.value = false;
		}
	}

	/**
	 * Reduce the ingredient lines to the payload expected by the backend.
	 */
	function buildItems(
		ingredients: string[],
		itemSelections?: Record<number, string>,
		itemEnabled?: Record<number, boolean>,
	): BringItemPayload[] {
		return ingredients.map((line, index) => {
			const item: BringItemPayload = { line };

			const selection = itemSelections?.[index];
			if (typeof selection === 'string' && selection !== '') {
				item.name = selection;
			}

			const enabled = itemEnabled?.[index];
			if (enabled !== undefined) {
				item.enabled = enabled;
			}

			return item;
		});
	}

	/**
	 * Check whether the current user has a stored Bring! connection.
	 */
	async function checkStatus(): Promise<boolean> {
		errorMessage.value = null;
		reconnectRequired.value = false;

		try {
			const { data } = await axios.get<{
				connected: boolean;
				email?: string;
			}>(`${BASE_URL}/status`);
			isConnected.value = Boolean(data.connected);
			userEmail.value = typeof data.email === 'string' ? data.email : '';
			return isConnected.value;
		} catch (error) {
			isConnected.value = false;
			errorMessage.value = extractMessage(
				error,
				t('cookbook', 'Could not load the Bring! connection.'),
			);
			return false;
		}
	}

	/**
	 * Connect to Bring! with the account email and password.
	 */
	async function login(email: string, password: string): Promise<boolean> {
		isLoading.value = true;
		errorMessage.value = null;
		reconnectRequired.value = false;

		try {
			const { data } = await axios.post<{
				connected: boolean;
				email: string;
			}>(`${BASE_URL}/login`, {
				email,
				password,
			});
			isConnected.value = Boolean(data.connected);
			userEmail.value = typeof data.email === 'string' ? data.email : '';
			return isConnected.value;
		} catch (error) {
			isConnected.value = false;
			errorMessage.value = extractMessage(
				error,
				t('cookbook', 'Could not connect to Bring!.'),
			);
			return false;
		} finally {
			isLoading.value = false;
		}
	}

	/**
	 * Remove the stored Bring! connection and reset the local state.
	 */
	async function disconnect(): Promise<boolean> {
		isLoading.value = true;
		errorMessage.value = null;
		reconnectRequired.value = false;

		try {
			const { data } = await axios.delete<{ connected: boolean }>(
				`${BASE_URL}/connection`,
			);
			isConnected.value = Boolean(data.connected);
			userEmail.value = '';
			lists.value = [];
			selectedListUuid.value = '';
			previewRows.value = [];
			return true;
		} catch (error) {
			errorMessage.value = extractMessage(
				error,
				t('cookbook', 'Could not disconnect from Bring!.'),
			);
			return false;
		} finally {
			isLoading.value = false;
		}
	}

	/**
	 * Load the shopping lists and select the default one.
	 */
	async function loadLists(): Promise<void> {
		isLoading.value = true;
		errorMessage.value = null;
		reconnectRequired.value = false;

		try {
			const { data } = await axios.get<{
				lists?: BringList[];
				defaultListUuid?: string;
			}>(`${BASE_URL}/lists`);
			lists.value = Array.isArray(data.lists) ? data.lists : [];

			const defaultUuid =
				typeof data.defaultListUuid === 'string'
					? data.defaultListUuid
					: '';
			if (
				defaultUuid !== '' &&
				lists.value.some((list) => list.listUuid === defaultUuid)
			) {
				selectedListUuid.value = defaultUuid;
			} else {
				selectedListUuid.value =
					lists.value.length > 0 ? lists.value[0].listUuid : '';
			}
		} catch (error) {
			handleRequestError(
				error,
				t('cookbook', 'Could not load the Bring! lists.'),
			);
		} finally {
			isLoading.value = false;
		}
	}

	/**
	 * Show what exporting the ingredients to the selected list would change.
	 */
	async function loadPreview(
		recipeName: string,
		ingredients: string[],
		mode: BringExportMode,
		itemSelections?: Record<number, string>,
		itemEnabled?: Record<number, boolean>,
	): Promise<BringItemRow[]> {
		isLoading.value = true;
		errorMessage.value = null;
		reconnectRequired.value = false;

		try {
			const { data } = await axios.post<{ rows?: BringItemRow[] }>(
				`${BASE_URL}/preview`,
				{
					listUuid: selectedListUuid.value,
					items: buildItems(ingredients, itemSelections, itemEnabled),
					recipeName,
					mode,
				},
			);
			previewRows.value = Array.isArray(data.rows) ? data.rows : [];
			return previewRows.value;
		} catch (error) {
			previewRows.value = [];
			handleRequestError(
				error,
				t('cookbook', 'Could not load the preview.'),
			);
			return [];
		} finally {
			isLoading.value = false;
		}
	}

	/**
	 * Write the ingredients to the selected list and return how many entries changed.
	 */
	async function exportToBring(
		recipeName: string,
		ingredients: string[],
		mode: BringExportMode,
		itemSelections?: Record<number, string>,
		itemEnabled?: Record<number, boolean>,
	): Promise<number> {
		isLoading.value = true;
		errorMessage.value = null;
		reconnectRequired.value = false;

		try {
			const { data } = await axios.post<{
				written?: number;
				rows?: BringItemRow[];
			}>(`${BASE_URL}/export`, {
				listUuid: selectedListUuid.value,
				items: buildItems(ingredients, itemSelections, itemEnabled),
				recipeName,
				mode,
			});
			previewRows.value = Array.isArray(data.rows) ? data.rows : [];
			return typeof data.written === 'number' ? data.written : 0;
		} catch (error) {
			handleRequestError(
				error,
				t('cookbook', 'Could not export to Bring!.'),
			);
			return 0;
		} finally {
			isLoading.value = false;
		}
	}

	return {
		isConnected,
		userEmail,
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
	};
}
