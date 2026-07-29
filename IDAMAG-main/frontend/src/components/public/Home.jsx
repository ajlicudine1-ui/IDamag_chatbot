import React, { useEffect, useState } from "react";
import Header from "./Header";
import Footer from "./Footer";
import Hero from "./Hero";
import OfficeCard from "./OfficeCard";
import { getOffices } from "../../constants/offices";

function Home() {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadOffices = async () => {
      try {
        const data = await getOffices();
        setOffices(data);
      } catch (err) {
        console.error(err);
        setError("Unable to load categories.");
      } finally {
        setLoading(false);
      }
    };

    loadOffices();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <Hero />

      {/* Categories */}
      <main
        id="links"
        className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16"
      >
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
            DA RFO I Divisions and Sections
          </h2>

          <p className="text-slate-600 max-w-2xl mx-auto">
            Select a division to access its specific reports,
            documents, and resources.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">
              Loading categories...
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-600 font-semibold">
              {error}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {offices.map((office) => (
              <OfficeCard
                key={office.id}
                office={office}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default Home;