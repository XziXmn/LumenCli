/**
 * Wire Protocol Layer — WireHub 接口与实现
 *
 * WireHub 是 Wire 事件的中央调度器，负责事件的发布、订阅和回放。
 */

import type { WireEvent } from "./types.js";
import { WIRE_PROTOCOL_VERSION } from "./types.js";

export type WireSubscriber = (event: WireEvent) => void;

export interface WireHub {
	/** 发布一个 Wire 事件，分发给所有已注册的订阅者 */
	publish(event: WireEvent): void;
	/** 注册一个订阅者，返回取消订阅的函数 */
	subscribe(subscriber: WireSubscriber): () => void;
	/** 将历史事件按序列号顺序重放给指定订阅者 */
	replay(subscriber: WireSubscriber): void;
	/** 获取当前序列号（下一个事件将使用的 seq） */
	getNextSeq(): number;
	/** 释放所有资源并取消所有订阅 */
	dispose(): void;
}

export interface WireHubOptions {
	sessionId: string;
	/** 可选的持久化回调，每个事件发布后调用 */
	onPersist?: (event: WireEvent) => void;
}

/**
 * 创建一个内存 WireHub 实例。
 * 事件存储在内存中，支持 replay。可选的 onPersist 回调用于 JSONL 持久化。
 */
export function createWireHub(options: WireHubOptions): WireHub {
	const { onPersist } = options;
	const subscribers = new Set<WireSubscriber>();
	const history: WireEvent[] = [];
	let nextSeq = 1;

	return {
		publish(event: WireEvent) {
			history.push(event);
			nextSeq = event.seq + 1;
			for (const subscriber of subscribers) {
				try {
					subscriber(event);
				} catch {
					// 单个订阅者异常不影响其他订阅者
				}
			}
			onPersist?.(event);
		},
		subscribe(subscriber: WireSubscriber) {
			subscribers.add(subscriber);
			return () => {
				subscribers.delete(subscriber);
			};
		},
		replay(subscriber: WireSubscriber) {
			for (const event of history) {
				try {
					subscriber(event);
				} catch {
					// replay 中单个事件异常不中断后续
				}
			}
		},
		getNextSeq() {
			return nextSeq;
		},
		dispose() {
			subscribers.clear();
			history.length = 0;
		},
	};
}

/** 创建一个 Wire 事件的公共字段 */
export function wireEventBase(
	hub: WireHub,
	sessionId: string,
): Omit<WireEvent, "type"> & { version: string; seq: number; timestamp: string; sessionId: string } {
	return {
		version: WIRE_PROTOCOL_VERSION,
		seq: hub.getNextSeq(),
		timestamp: new Date().toISOString(),
		sessionId,
	};
}
