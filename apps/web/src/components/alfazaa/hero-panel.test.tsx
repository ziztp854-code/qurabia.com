import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createInitialState } from '@/lib/alfazaa/domain/state';
import { HeroPanel } from './hero-panel';
describe('owned hero controls', () => {
  it('saves the actual two starter troop cells and the chosen commander',()=>{
    const state=createInitialState(1792800000000),send=vi.fn().mockResolvedValue(undefined);
    render(<HeroPanel state={state} send={send} busy={false}/>);
    fireEvent.click(screen.getByRole('button',{name:'تشكيل الجيش'}));
    fireEvent.click(screen.getByRole('button',{name:'حفظ تشكيل الجيش'}));
    expect(send).toHaveBeenCalledWith({type:'hero-formation',heroIds:[62003],troopCells:[0,1],formationType:1});
  });
  it('sends source gear crafting and equipped piece commands',()=>{
    const state=createInitialState(1792800000000),send=vi.fn().mockResolvedValue(undefined);
    state.balances['800081']=20;state.balances['1710101']=1;
    render(<HeroPanel state={state} send={send} busy={false}/>);
    fireEvent.click(screen.getByRole('button',{name:'صناعة التجهيز'}));
    expect(send).toHaveBeenCalledWith({type:'hero-craft-gear',itemId:1710101});
    fireEvent.click(screen.getByRole('button',{name:'تجهيز القطعة'}));
    expect(send).toHaveBeenCalledWith({type:'hero-equip',heroId:62003,itemId:1710101});
  });
  it('learns a selected book only after the source level unlock',()=>{
    const state=createInitialState(1792800000000),send=vi.fn().mockResolvedValue(undefined);
    state.realm.heroes.roster['62003'].level=20;state.balances['1000007']=1;
    render(<HeroPanel state={state} send={send} busy={false}/>);
    fireEvent.click(screen.getByRole('button',{name:'تعلم المهارة'}));
    expect(send).toHaveBeenCalledWith({type:'hero-skill',heroId:62003,slot:1,skillId:1000007});
  });
  it('shows only the actual starter as owned and sends its selected XP book', () => {
    const state = createInitialState(1792800000000),
      send = vi.fn().mockResolvedValue(undefined);
    state.balances['110021'] = 1;
    render(<HeroPanel state={state} send={send} busy={false} />);
    expect(screen.getByRole('heading', { name: 'ويليام' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تدريب البطل' }));
    expect(send).toHaveBeenCalledWith({
      type: 'hero-train',
      heroId: 62003,
      itemId: 110021,
      count: 1,
    });
  });
  it('requires the actual fragment balance before enabling recruitment', () => {
    const state = createInitialState(1792800000000),
      send = vi.fn();
    render(<HeroPanel state={state} send={send} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'تجنيد أبطال' }));
    fireEvent.click(screen.getByRole('button', { name: /الإسكندر/ }));
    expect(screen.getByRole('button', { name: 'تجنيد البطل' })).toBeDisabled();
  });
  it('starts an unlocked campaign with no client outcome or RNG fields', () => {
    const state = createInitialState(1792800000000),
      send = vi.fn().mockResolvedValue(undefined);
    render(<HeroPanel state={state} send={send} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'ساحة القتال' }));
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ القتال' }));
    expect(send).toHaveBeenCalledWith({ type: 'hero-battle', mode: 'campaign', stageId: 1 });
  });
  it('disables commands while an account action is pending', () => {
    const state = createInitialState(1792800000000);
    state.balances['110021'] = 1;
    render(<HeroPanel state={state} send={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: 'تدريب البطل' })).toBeDisabled();
  });
});
