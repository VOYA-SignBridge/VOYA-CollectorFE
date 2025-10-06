export default function CaptureGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-[600px] shadow-lg max-h-[80vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">📹 Hướng dẫn ghi hình</h2>
        
        <ul className="list-disc ml-5 space-y-2 text-gray-700">
          <li>Đặt camera ngang tầm mắt, giữ khoảng cách ~1m.</li>
          <li>Tay luôn nằm trong khung hình.</li>
          <li>Quay trong môi trường đủ sáng, nền đơn giản.</li>
          <li>Mỗi mẫu kéo dài ít nhất <b>3–5 giây</b>.</li>
          <li>Thực hiện động tác chậm rãi, rõ ràng.</li>
          <li>Chọn đúng nhãn (label) trước khi bắt đầu quay.</li>
          <li>Quay nhiều lần với góc và tốc độ khác nhau.</li>
        </ul>

        <button
          className="mt-6 px-4 py-2 bg-blue-600 text-white rounded"
          onClick={onClose}
        >
          Tôi đã hiểu
        </button>
      </div>
    </div>
  );
}
