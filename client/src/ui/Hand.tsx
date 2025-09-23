import React from 'react';
import type { Card } from '../types';

interface HandProps {
  hand: Card[];
  onPlay: (cardId: string) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (cardId: string) => void;
}

const CARD_LABEL: Record<string,string> = {
  DEFUSE: '拆除',
  BOMB: '炸弹',
  IMPLODING: '黑洞',
  SKIP: '跳过',
  ATTACK: '攻击',
  TARGETED_ATTACK: '指向攻击',
  REVERSE: '反转',
  SEE_FUTURE: '预言',
  ALTER_FUTURE: '改变未来',
  FAVOR: '帮助',
  SHUFFLE: '切洗',
  DRAW_BOTTOM: '抽底',
  NOPE: '否决',
  SALVAGE: '打捞',
  BOSS_KITTEN: '老板猫',
  SLIPPER_KITTEN: '拖鞋猫',
  BUG_KITTEN: 'Bug猫',
  NEZHA_KITTEN: '哪吒猫',
  LIGHTNING_KITTEN: '闪电猫',
  POTATO_KITTEN: '土豆猫',
};

export const Hand: React.FC<HandProps> = ({ hand, onPlay, selectable, selectedIds = [], onToggleSelect }) => {
  if (!hand.length) return <div className="hand empty">(空)</div>;
  const selectedSet = new Set(selectedIds);
  return (
    <div className="hand">
      {hand.map(c => {
        const sel = selectedSet.has(c.id);
        return (
          <button
            key={c.id}
            className={`card card-${c.type.toLowerCase()} ${sel ? 'sel' : ''}`}
            onClick={() => {
              if (selectable && onToggleSelect) {
                onToggleSelect(c.id);
              } else {
                onPlay(c.id);
              }
            }}
            title={c.type}
          >
            {CARD_LABEL[c.type] || c.type}
          </button>
        );
      })}
    </div>
  );
};
