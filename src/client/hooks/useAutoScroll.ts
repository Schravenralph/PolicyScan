import { useEffect, useRef } from 'react';
import { BaseLogEntry } from '../components/shared/LogBubble';

const SCROLL_THRESHOLD_PIXELS = 100;

interface UseAutoScrollProps {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    logs: BaseLogEntry[];
    runningWorkflowId?: string | null;
}

export function useAutoScroll({
    scrollContainerRef,
    logs,
    runningWorkflowId
}: UseAutoScrollProps) {
    const scrollRafRef = useRef<number | null>(null);

    // Auto-scroll to bottom when new logs appear
    useEffect(() => {
        if (!scrollContainerRef.current || logs.length === 0) return;

        const container = scrollContainerRef.current;
        
        if (scrollRafRef.current !== null) {
            cancelAnimationFrame(scrollRafRef.current);
        }
        
        scrollRafRef.current = requestAnimationFrame(() => {
            if (!container) {
                scrollRafRef.current = null;
                return;
            }
            
            const scrollHeight = container.scrollHeight;
            const scrollTop = container.scrollTop;
            const clientHeight = container.clientHeight;
            
            const isNearBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD_PIXELS;
            const isInitialContent = scrollHeight <= clientHeight;

            if (isNearBottom || isInitialContent) {
                container.scrollTop = scrollHeight;
            }
            
            scrollRafRef.current = null;
        });

        return () => {
            if (scrollRafRef.current !== null) {
                cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
        };
    }, [logs.length, scrollContainerRef]);

    // MutationObserver for DOM changes while a run is active
    useEffect(() => {
        if (!scrollContainerRef.current || !runningWorkflowId) return;

        const container = scrollContainerRef.current;
        let lastScrollHeight = container.scrollHeight;
        let rafId: number | null = null;

        const observer = new MutationObserver(() => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }

            rafId = requestAnimationFrame(() => {
                if (!container) {
                    rafId = null;
                    return;
                }
                
                const scrollHeight = container.scrollHeight;
                if (scrollHeight !== lastScrollHeight) {
                    lastScrollHeight = scrollHeight;
                    
                    const scrollTop = container.scrollTop;
                    const clientHeight = container.clientHeight;
                    const isNearBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD_PIXELS;
                    const isInitialContent = scrollHeight <= clientHeight;

                    if (isNearBottom || isInitialContent) {
                        container.scrollTop = scrollHeight;
                    }
                }
                
                rafId = null;
            });
        });

        observer.observe(container, {
            childList: true,
            subtree: true,
            characterData: true
        });

        return () => {
            observer.disconnect();
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [runningWorkflowId, scrollContainerRef]);
}
