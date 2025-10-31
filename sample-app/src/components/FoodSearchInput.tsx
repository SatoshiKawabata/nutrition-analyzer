import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FoodSearchResult } from '../types/nutrition';
import { searchFoods } from '../lib/api';

interface FoodSearchInputProps {
  selectedFood?: FoodSearchResult;
  onSelect: (food: FoodSearchResult | undefined) => void;
  disabled?: boolean;
}

export const FoodSearchInput = ({ selectedFood, onSelect, disabled }: FoodSearchInputProps) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FoodSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<{
    top: number;
    left: number;
    width: number;
  }>();

  const containerRef = useRef<HTMLDivElement | null>(null);

  const updateDropdownPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    setDropdownStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width
    });
  }, []);

  useEffect(() => {
    setQuery(selectedFood?.nameJp ?? '');
  }, [selectedFood?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (!query.trim() || query.trim() === (selectedFood?.nameJp ?? '')) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const nextSuggestions = await searchFoods(query);
        if (!active) return;
        setSuggestions(nextSuggestions);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, query, selectedFood?.nameJp]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
    }
  }, [isOpen, updateDropdownPosition, query, suggestions.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleReposition = () => updateDropdownPosition();

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateDropdownPosition]);

  const renderedSuggestions = useMemo(() => {
    if (loading) {
      return (
        <li className="food-suggest__item food-suggest__item--muted" aria-live="polite">
          検索中…
        </li>
      );
    }

    if (error) {
      return (
        <li className="food-suggest__item food-suggest__item--error" role="alert">
          {error}
        </li>
      );
    }

    if (!suggestions.length) {
      return (
        <li className="food-suggest__item food-suggest__item--muted" aria-live="polite">
          候補が見つかりません
        </li>
      );
    }

    return suggestions.map((item) => (
      <li key={item.id}>
        <button
          type="button"
          className="food-suggest__item"
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
            setIsOpen(false);
          }}
        >
          <span className="food-suggest__primary">{item.nameJp}</span>
          <span className="food-suggest__secondary">
            {item.foodGroup?.nameJp ?? '食品群未設定'} / {item.foodCode ?? 'コードなし'}
          </span>
        </button>
      </li>
    ));
  }, [loading, error, suggestions, onSelect]);

  return (
    <div className="food-search" ref={containerRef}>
      <div className="food-search__control">
        <input
          type="text"
          className="food-search__input"
          value={query}
          disabled={disabled}
          placeholder="食品名・食品群で検索"
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setIsOpen(true);
            if (!next) {
              onSelect(undefined);
            }
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(event) => {
            setIsComposing(false);
            setQuery(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false);
              return;
            }

            if (event.key === 'Enter' && suggestions.length && !isComposing) {
              event.preventDefault();
              onSelect(suggestions[0]);
              setIsOpen(false);
            }
          }}
        />
        {selectedFood ? (
          <button
            type="button"
            className="food-search__clear"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              onSelect(undefined);
              setIsOpen(true);
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {isOpen && dropdownStyle
        ? createPortal(
            <ul
              className="food-suggest"
              style={{
                top: `${dropdownStyle.top}px`,
                left: `${dropdownStyle.left}px`,
                width: `${dropdownStyle.width}px`
              }}
            >
              {renderedSuggestions}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
};
