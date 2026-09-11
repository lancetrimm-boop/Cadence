import { HomeScreen } from "@/components/home/HomeScreen";
import { Studio } from "@/components/studio/Studio";
import { useStudio } from "@/lib/cadence/store";

export default function App() {
  const activeView = useStudio((s) => s.activeView);

  return (
    <div className="h-full w-full overflow-hidden bg-bg text-fg">
      {activeView === "home" ? <HomeScreen /> : <Studio />}
    </div>
  );
}
