// QUICK SWITCH TO MINIMAL STORE FOR TESTING

// In AssetPort.tsx, replace this line:
// import { useBackgroundStoreWorking } from "@/stores/backgroundStoreWorking";

// With this line:
// import { useBackgroundStoreMinimal } from "@/stores/backgroundStoreMinimal";

// And replace this line:
// const { getBackground, setBackground, migrateLegacyConfig } = useBackgroundStoreWorking();

// With this line:
// const { getBackground, setBackground, migrateLegacyConfig } = useBackgroundStoreMinimal();

// And replace this line:
// import { getAssetKeyWithBookWorking } from "@/stores/backgroundStoreWorking";

// With this line:
// import { getAssetKeyWithBookMinimal } from "@/stores/backgroundStoreMinimal";

// And replace all instances of:
// getAssetKeyWithBookWorking

// With:
// getAssetKeyWithBookMinimal

// This will give you a clean, minimal store that just works without persistence
