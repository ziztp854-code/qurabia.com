import { formatNumber } from '@/lib/utils';

export type ShareCardResult = { gameTitle: string; name: string; rank: number; score: number };

/** Create the image locally: no session identifiers or player data leave the device. */
export async function createResultShareCard(result: ShareCardResult): Promise<File> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');

  // The exported image is independent of page CSS, so it has its own fixed palette.
  const background = context.createLinearGradient(0, 0, 1200, 630);
  background.addColorStop(0, '#071320');
  background.addColorStop(0.55, '#10283a');
  background.addColorStop(1, '#07151e');
  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 630);

  // Fine geometric lines suggest the platform's Arabic visual identity without
  // competing with the result or relying on external images.
  context.strokeStyle = 'rgba(218, 184, 105, 0.11)';
  context.lineWidth = 1;
  for (let x = -300; x < 700; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 630, 630);
    context.stroke();
  }
  context.strokeStyle = 'rgba(223, 190, 113, 0.45)';
  context.lineWidth = 2;
  context.strokeRect(26, 26, 1148, 578);

  // Rank medallion.
  const glow = context.createRadialGradient(300, 315, 25, 300, 315, 260);
  glow.addColorStop(0, 'rgba(209, 164, 77, 0.24)');
  glow.addColorStop(1, 'rgba(209, 164, 77, 0)');
  context.fillStyle = glow;
  context.fillRect(35, 50, 530, 530);
  context.beginPath();
  context.arc(300, 315, 160, 0, Math.PI * 2);
  context.fillStyle = '#102536';
  context.fill();
  context.strokeStyle = '#cba85e';
  context.lineWidth = 3;
  context.stroke();
  context.beginPath();
  context.arc(300, 315, 143, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(224, 190, 119, 0.45)';
  context.lineWidth = 1;
  context.stroke();
  context.textAlign = 'center';
  context.direction = 'rtl';
  context.fillStyle = '#e5c77f';
  context.font = '700 30px "Cairo Variable", Cairo, sans-serif';
  context.fillText('المركز', 300, 270, 245);
  context.font = '800 112px "Cairo Variable", Cairo, sans-serif';
  context.fillText(formatNumber(result.rank), 300, 390, 245);

  // Right-aligned typography preserves the reading order for Arabic names.
  context.textAlign = 'right';
  context.fillStyle = '#e5c77f';
  context.font = '800 38px "Cairo Variable", Cairo, sans-serif';
  context.fillText('تحدّي', 1090, 105, 580);
  context.fillStyle = '#aabdc5';
  context.font = '600 25px "Cairo Variable", Cairo, sans-serif';
  context.fillText('نتيجة الجولة', 1090, 166, 580);
  context.fillStyle = '#ffffff';
  context.font = '700 45px "Cairo Variable", Cairo, sans-serif';
  context.fillText(result.gameTitle, 1090, 230, 560);
  context.fillStyle = '#c4d2d6';
  context.font = '600 27px "Cairo Variable", Cairo, sans-serif';
  context.fillText('اللاعب', 1090, 302, 560);
  context.fillStyle = '#ffffff';
  context.font = '800 50px "Cairo Variable", Cairo, sans-serif';
  context.fillText(result.name, 1090, 368, 560);
  context.fillStyle = '#e4c67e';
  context.fillRect(530, 406, 560, 2);
  context.font = '800 52px "Cairo Variable", Cairo, sans-serif';
  context.fillText(`${formatNumber(result.score)} نقطة`, 1090, 480, 560);
  context.fillStyle = '#b5c5cb';
  context.font = '500 24px "Cairo Variable", Cairo, sans-serif';
  context.direction = 'ltr';
  context.textAlign = 'left';
  context.fillText('qurabia.com', 530, 548, 560);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image export unavailable');
  return new File([blob], 'tahaddi-result.png', { type: 'image/png' });
}
