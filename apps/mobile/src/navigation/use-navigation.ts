import { useCallback, useState } from 'react';
export type NativeScreen='home'|'rooms'|'room'|'profile';
export function useNavigation(){
  const [screen,setScreen]=useState<NativeScreen>('home');
  const go=useCallback((next:NativeScreen)=>setScreen(next),[]);
  return {screen,go};
}
