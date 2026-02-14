/**
 * DocumentMetadataTooltip Component
 * 
 * Displays document metadata in a hover tooltip after a 2-second delay.
 * Shows title and text preview in an accessible format.
 * 
 * @see Plan: Document Metadata Hover Tooltip Implementation
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '../ui/hover-card';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
import {
  getCanonicalDocumentTitle,
} from '../../utils/canonicalDocumentUtils';
import { t } from '../../utils/i18n';

interface DocumentMetadataTooltipProps {
  document: CanonicalDocument | LightweightDocument;
  children: React.ReactNode;
  /** Maximum number of characters to show in text preview */
  textPreviewLength?: number;
}

/**
 * Extracts text preview from document fullText
 */
function getTextPreview(document: CanonicalDocument | LightweightDocument, maxLength: number = 300): string {
  // Try fullTextPreview first (for performance), then fallback to fullText
  const fullText = (document as { fullTextPreview?: string; fullText?: string }).fullTextPreview || 
                   (document as { fullText?: string }).fullText || '';
  
  if (!fullText) return '';
  
  // Get first paragraph or first portion
  const firstParagraph = fullText.split('\n\n')[0];
  const textToUse = firstParagraph || fullText;
  
  if (textToUse.length <= maxLength) {
    return textToUse;
  }
  
  // Truncate at word boundary if possible
  const truncated = textToUse.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const lastBreak = Math.max(lastSpace, lastNewline);
  
  if (lastBreak > maxLength * 0.8) {
    // Use word boundary if it's not too close to the start
    return truncated.substring(0, lastBreak) + '...';
  }
  
  return truncated + '...';
}

export function DocumentMetadataTooltip({
  document,
  children,
  textPreviewLength = 300,
}: DocumentMetadataTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverStartTimeRef = useRef<number | null>(null);

  // Extract title and text preview
  const title = useMemo(() => getCanonicalDocumentTitle(document), [document]);
  const textPreview = useMemo(
    () => getTextPreview(document, textPreviewLength),
    [document, textPreviewLength]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle mouse enter / focus
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      // Start hover timer
      hoverStartTimeRef.current = Date.now();
      timeoutRef.current = setTimeout(() => {
        setShouldShow(true);
        setIsOpen(true);
      }, 2000); // 2 second delay
    } else {
      // Cancel hover timer
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      hoverStartTimeRef.current = null;
      setShouldShow(false);
      setIsOpen(false);
    }
  }, []);

  // Detect touch capability for mobile support
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  useEffect(() => {
    // Check if device supports touch
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  // For touch devices, show immediately on tap (no delay)
  const handleTouchOpenChange = useCallback((open: boolean) => {
    if (isTouchDevice) {
      setIsOpen(open);
      setShouldShow(open);
    } else {
      handleOpenChange(open);
    }
  }, [isTouchDevice, handleOpenChange]);

  // Content to display in tooltip
  const metadataContent = useMemo(() => (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <h4 className="font-semibold text-sm text-foreground mb-1">
          Titel
        </h4>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>

      {/* Text Preview */}
      {textPreview && (
        <div>
          <h4 className="font-semibold text-sm text-foreground mb-1">
            Inhoud
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {textPreview}
          </p>
        </div>
      )}

      {/* Screen reader only: Full metadata announcement */}
      <div className="sr-only" aria-live="polite">
        Document metadata geladen voor {title}
      </div>
    </div>
  ), [title, textPreview]);

  return (
    <HoverCard
      open={isOpen}
      onOpenChange={handleTouchOpenChange}
    >
      <HoverCardTrigger
        asChild
        aria-label={`${t('documentMetadata.document')} ${title}. ${isTouchDevice ? t('documentMetadata.tapFor') : t('documentMetadata.hoverFor')} ${t('documentMetadata.moreInfo')}`}
      >
        <div>{children}</div>
      </HoverCardTrigger>
      {shouldShow && (
        <HoverCardContent
          className="w-80 max-w-[90vw] max-h-[60vh] overflow-y-auto"
          align="start"
          side="right"
          sideOffset={8}
          aria-label={t('documentMetadata.ariaLabel')}
        >
          {metadataContent}
        </HoverCardContent>
      )}
    </HoverCard>
  );
}
