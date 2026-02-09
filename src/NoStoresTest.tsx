const NoStoresTest = () => {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-green-400">No Stores Test</h1>
        <p className="text-xl">If you can see this, basic React works!</p>
        <div className="mt-4 p-4 border border-gray-600 rounded">
          <h2 className="text-lg mb-2">Status Check:</h2>
          <p>✅ React rendering</p>
          <p>✅ Tailwind CSS working</p>
          <p>✅ Basic component structure</p>
          <p>❓ Store integration (testing)</p>
        </div>
      </div>
    </div>
  );
};

export default NoStoresTest;
