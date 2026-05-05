// Action Hub — all åtgärdslogik finns i ActionTracker. Inga tabbar.
import ActionTracker from "./ActionTracker";

export default function ActionHub() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <ActionTracker />
    </div>
  );
}
