// ? Hướng dẫn — quick start & shortcuts (Vietnamese UI), docked beside the canvas.
import type { ReactNode } from 'react';

const K = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-edge bg-ink px-1 font-mono text-[10.5px] text-glow-amber">{children}</kbd>
);
const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-3 rounded border border-edge bg-[#12162a] p-3">
    <h3 className="mb-1.5 font-pixel text-lg tracking-wide text-slate-100">{title}</h3>
    <div className="space-y-1 text-[11.5px] leading-relaxed text-slate-300">{children}</div>
  </section>
);

export default function HelpPanel({ onClose, onOpenReference }: { onClose: () => void; onOpenReference: () => void }) {
  return (
    <aside className="flex w-[min(380px,36vw)] min-w-[300px] shrink-0 flex-col border-l border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="font-pixel text-xl tracking-widest text-glow-cyan">? HƯỚNG DẪN</span>
        <button className="btn px-1.5" onClick={onClose} title="Đóng (F1)">
          ✕
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto p-3">
        <Sec title="Bắt đầu nhanh">
          <p>
            1. Chọn <b>Load Example…</b> trên thanh trên cùng (ví dụ MOD-7) — mạch chạy ngay và giản đồ xung tự ghi.
          </p>
          <p>
            2. Bấm <b>❚❚ Pause</b> rồi <b>Step +1 Clock Edge</b> (hoặc <K>Enter</K>) để xem từng cạnh xung.
          </p>
          <p>
            3. Bấm vào một Flip-Flop để xem <b>bảng chân trị sống</b> ở cột ANALYSIS và chỉnh cạnh kích, cực tính PRĒ/CLR̄, trạng thái đầu trong
            Inspector.
          </p>
          <p>
            4. Tra công thức nhanh:{' '}
            <button className="text-glow-cyan underline" onClick={onOpenReference}>
              📖 Tra bảng
            </button>{' '}
            (phím <K>B</K>).
          </p>
        </Sec>
        <Sec title="Vẽ mạch">
          <p>Chọn linh kiện ở hộp TOOLS rồi bấm lên lưới để đặt (<K>Esc</K> để thôi).</p>
          <p>
            Kéo từ một <b>chân</b> để nối dây vuông góc · công cụ dây <K>W</K>: bấm từng điểm gập, <K>F</K> đổi hướng gập, <K>Esc</K>/chuột phải để kết
            thúc.
          </p>
          <p>
            <K>R</K> xoay · <K>Del</K> xóa · kéo linh kiện để di chuyển (dây đi theo) · bấm công tắc để đổi 0/1 · bấm CLK để tạo 1 cạnh bằng tay.
          </p>
          <p>
            Cổng AND/OR/NAND/NOR/XOR/XNOR: đổi <b>2 / 3 / 4 chân vào</b> trong Inspector.
          </p>
        </Sec>
        <Sec title="Giản đồ xung (Timing Diagram)">
          <p>
            Rê chuột lên chân/dây rồi nhấn <K>P</K> để ghim tín hiệu (nhấn lần nữa để bỏ), hoặc dùng nút “+” trong Inspector.
          </p>
          <p>Vạch đứt + mũi tên ↑/↓ = cạnh kích tích cực · vạch đỏ CLR! / cam PRE! = tác động bất đồng bộ · xung đỏ hẹp = glitch (trạng thái tạm).</p>
          <p>
            Lăn chuột để cuộn thời gian, <K>Ctrl</K>+lăn để phóng to, <b>● LIVE</b> để theo thời gian thực. Đặt tên FF là <b>FF0, FF1, FF2…</b> (FF0 =
            LSB) để hiện trạng thái bộ đếm và sơ đồ chuyển trạng thái.
          </p>
        </Sec>
        <Sec title="Quy ước mô phỏng">
          <p>1 tick = 10 ms trễ cổng. Ngõ vào bỏ trống đọc là 0; PRĒ/CLR̄ bỏ trống luôn KHÔNG tác động.</p>
          <p>Màu dây: vàng = 1 (mạnh), xanh = 1 qua điện trở, xám = 0, nét đứt = thả nổi, đỏ = chập mạch.</p>
        </Sec>
        <Sec title="Phím tắt">
          <p>
            <K>V</K> chọn · <K>W</K> dây · <K>1</K>–<K>8</K> linh kiện · <K>R</K> xoay · <K>P</K> ghim tín hiệu · <K>Enter</K> 1 cạnh CLK
          </p>
          <p>
            <K>Ctrl</K>+<K>Z</K> hoàn tác · <K>Ctrl</K>+<K>Y</K> làm lại · <K>B</K> Tra bảng · <K>F1</K> Hướng dẫn · <K>Space</K>+kéo cuộn màn hình
          </p>
        </Sec>
      </div>
    </aside>
  );
}
