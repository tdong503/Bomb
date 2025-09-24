import React, { useState, useMemo } from 'react';
import type { RoomStatePublic, Card } from '../types';
import { PlayerList } from './PlayerList';
import { Hand } from './Hand';
import { getSocket } from '../socket';

interface Props {
  room: RoomStatePublic;
  you: any; // simplified; could refine with shared types
  hand: Card[];
  onStart: () => void;
  onDraw: () => void;
  onPlay: (cardId: string) => void;
  onComboPlay?: (primary: string, rest: string[], targetPlayerId?: string, namedCardType?: string) => void;
}

type SelectMode = 'none' | 'pair' | 'triple';

export const RoomView: React.FC<Props> = ({ room, you, hand, onStart, onDraw, onPlay, onComboPlay }) => {
  const isOwner = you && you.id === room.ownerId;
  const isTurn = you && room.turnPlayerId === you.id;
  const winner = room.winnerId && room.players.find(p => p.id === room.winnerId);

  const [mode, setMode] = useState<SelectMode>('none');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetPlayerId, setTargetPlayerId] = useState<string>('');
  const [namedCardType, setNamedCardType] = useState('');

  const otherPlayers = useMemo(()=> room.players.filter(p => p.id !== you?.id && p.alive), [room.players, you]);

  function resetCombo() {
    setMode('none');
    setSelectedIds([]);
    setTargetPlayerId('');
    setNamedCardType('');
  }

  const toggleSelect = (id: string) => {
    if (mode === 'none') return;
    setSelectedIds(prev => {
      const exists = prev.includes(id);
      let next = exists ? prev.filter(x => x !== id) : [...prev, id];
      // 限制长度
      const cap = mode === 'pair' ? 2 : 3;
      if (next.length > cap) next = next.slice(next.length - cap); // 保留最近选择的 cap 个
      return next;
    });
  };

  const selectedCards = selectedIds.map(i => hand.find(c => c.id === i)).filter(Boolean) as Card[];
  const sameType = selectedCards.length > 0 && selectedCards.every(c => c.type === selectedCards[0].type);
  const expectedLen = mode === 'pair' ? 2 : mode === 'triple' ? 3 : 0;
  const enough = expectedLen > 0 && selectedCards.length === expectedLen && sameType;

  const needsTarget = mode === 'pair' || mode === 'triple';
  const needsNamedType = mode === 'triple';

  const canConfirm = enough && (!needsTarget || targetPlayerId) && (!needsNamedType || namedCardType.trim().length > 0);

  function confirmCombo() {
    if (!canConfirm) return;
    const [first, ...rest] = selectedIds;
    if (onComboPlay) {
      onComboPlay(first, rest, targetPlayerId || undefined, needsNamedType ? namedCardType.trim() : undefined);
    } else {
      // fallback 直接使用 socket
      getSocket().emit('game:playCard', { cardId: first, comboCardIds: rest, targetPlayerId: targetPlayerId || undefined, namedCardType: needsNamedType ? namedCardType.trim() : undefined });
    }
    resetCombo();
  }

  return (
    <div className="room-layout">
      <div className="left-panel">
        <PlayerList room={room} youId={you?.id} />
        {!room.started && isOwner && (
          <button className="primary" onClick={onStart}>开始游戏</button>
        )}
        <br />
        {room.started && !winner && (
          <div className="turn-actions column">
            <div className="row gap">
              <button disabled={!isTurn || mode !== 'none'} onClick={onDraw}>摸牌</button>
              <button disabled={!isTurn || mode !== 'none'} onClick={()=>setMode('pair')}>两张组合</button>
              <button disabled={!isTurn || mode !== 'none'} onClick={()=>setMode('triple')}>三张组合</button>
            </div>
            {mode !== 'none' && (
              <div className="combo-panel">
                <div>模式: {mode === 'pair' ? '两张相同' : '三张相同'} {sameType ? '' : '(需相同类型)'}</div>
                <div>已选: {selectedCards.map(c=>c?.type).join(', ') || '无'}</div>
                {needsTarget && (
                  <div className="field small-field">
                    <label>目标玩家</label>
                    <select value={targetPlayerId} onChange={e=>setTargetPlayerId(e.target.value)}>
                      <option value="">(选择)</option>
                      {otherPlayers.map(p=> <option key={p.id} value={p.id}>{p.nickname}</option> )}
                    </select>
                  </div>
                )}
                {needsNamedType && (
                  <div className="field small-field">
                    <label>指定牌类型(从目标手牌中)</label>
                    <input value={namedCardType} placeholder="例如 DEFUSE" onChange={e=>setNamedCardType(e.target.value.toUpperCase())} />
                  </div>
                )}
                <div className="actions-row wrap">
                  <button disabled={!canConfirm} className="primary" onClick={confirmCombo}>确认组合</button>
                  <button onClick={resetCombo}>取消</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="main-panel">
        <h3>我的手牌</h3>
        <Hand hand={hand} onPlay={onPlay} selectable={mode!=='none'} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
        {isTurn && mode==='none' && <div className="hint">当前是你的回合，可以出任意数量的牌，然后必须摸一张。</div>}
        {isTurn && mode!=='none' && <div className="hint">选择{mode==='pair'? '两张' : '三张'}相同的牌，再选择目标与(必要时)类型后确认。</div>}
      </div>
    </div>
  );
};
