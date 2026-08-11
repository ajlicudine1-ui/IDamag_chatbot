import React, { useEffect, useState } from "react";
import Header from "./Header";
import Footer from "./Footer";
import Hero from "./Hero";
import OfficeCard from "./OfficeCard";
import { getOffices } from "../../constants/offices";
import {
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  X,
} from "lucide-react";

function Home() {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Work-in-progress modal
  const [showNotice, setShowNotice] = useState(true);
  const [comment, setComment] = useState("");

  /*
   * =========================================================
   * GOOGLE FORM SETTINGS
   * =========================================================
   *
   * Replace these with your actual Google Form details.
   *
   * Example form:
   * https://docs.google.com/forms/d/e/FORM_ID/viewform
   *
   * Example comment field:
   * entry.123456789
   */

  const GOOGLE_FORM_URL =
    "https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform";

  const COMMENT_ENTRY_ID = "entry.YOUR_COMMENT_ENTRY_ID";

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

  /*
   * Prevent page scrolling while modal is open.
   */
  useEffect(() => {
    if (showNotice) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [showNotice]);

  /*
   * Redirect to Google Forms.
   *
   * The typed comment is passed into the Google Form
   * using Google's pre-filled form URL format.
   */
  const handleLeaveComment = () => {
    const trimmedComment = comment.trim();

    let formUrl = GOOGLE_FORM_URL;

    if (trimmedComment) {
      formUrl +=
        `?usp=pp_url&${COMMENT_ENTRY_ID}=` +
        encodeURIComponent(trimmedComment);
    }

    window.location.href = formUrl;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* =====================================================
          PAGE CONTENT
          Everything becomes blurred while modal is open
      ====================================================== */}

      <div
        className={`
          min-h-screen
          flex
          flex-col
          transition-all
          duration-300

          ${
            showNotice
              ? "blur-[3px] pointer-events-none select-none"
              : ""
          }
        `}
      >
        <Header />

        {/* Hero */}
        <Hero />

        {/* Categories */}
        <main
          id="links"
          className="
            flex-grow

            w-full
            max-w-7xl

            mx-auto

            px-4
            sm:px-6
            lg:px-8

            py-16
          "
        >
          <div className="text-center mb-16 space-y-4">
            <h2
              className="
                text-3xl
                md:text-4xl

                font-bold

                text-slate-900

                tracking-tight
              "
            >
              DA RFO I Divisions and Sections
            </h2>

            <p
              className="
                text-slate-600

                max-w-2xl
                mx-auto
              "
            >
              Select a division to access its specific
              reports, documents, and resources.
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
            <div
              className="
                grid
                grid-cols-1
                md:grid-cols-2
                lg:grid-cols-3

                gap-6
                md:gap-8
              "
            >
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


      {/* =====================================================
          WORK IN PROGRESS MODAL
      ====================================================== */}

      {showNotice && (
        <div
          className="
            fixed
            inset-0
            z-[9999]

            flex
            items-center
            justify-center

            px-4
            py-6

            bg-slate-950/45

            backdrop-blur-[2px]
          "
        >

          {/* Modal */}
          <div
            className="
              relative

              w-full
              max-w-xl

              overflow-hidden

              rounded-3xl

              bg-white

              shadow-2xl
              shadow-slate-950/25

              border
              border-white/60

              animate-[modalAppear_.25s_ease-out]
            "
          >

            {/* Decorative top section */}
            <div
              className="
                relative

                px-7
                sm:px-9

                pt-8
                pb-6

                bg-gradient-to-br
                from-[#173F32]
                via-[#245844]
                to-[#315F47]

                text-white
              "
            >

              {/* Decorative circle */}
              <div
                className="
                  absolute
                  -right-16
                  -top-16

                  w-44
                  h-44

                  rounded-full

                  bg-white/5
                "
              />

              <div
                className="
                  absolute
                  right-14
                  -bottom-16

                  w-32
                  h-32

                  rounded-full

                  bg-yellow-300/10
                "
              />

              <div className="relative z-10">

                <div
                  className="
                    inline-flex
                    items-center
                    gap-2

                    mb-5

                    px-3
                    py-1.5

                    rounded-full

                    bg-white/10

                    border
                    border-white/15

                    text-xs
                    font-bold

                    tracking-wide
                    uppercase
                  "
                >
                  <AlertTriangle className="w-4 h-4" />

                  Development Notice
                </div>

                <h2
                  className="
                    text-2xl
                    sm:text-3xl

                    font-extrabold

                    tracking-tight
                  "
                >
                  I-DAMAG is still a work in progress
                </h2>

                <p
                  className="
                    mt-3

                    max-w-lg

                    text-sm
                    sm:text-base

                    leading-7

                    text-white/80
                  "
                >
                  Some features, dashboards, and information
                  may still be under development. Your
                  comments and suggestions can help us improve
                  the system.
                </p>

              </div>
            </div>


            {/* Modal content */}
            <div className="px-7 sm:px-9 py-7">

              <div className="mb-5">
                <div
                  className="
                    flex
                    items-center
                    gap-2

                    mb-2
                  "
                >
                  <MessageSquare
                    className="
                      w-5
                      h-5

                      text-[#245844]
                    "
                  />

                  <label
                    htmlFor="work-progress-comment"
                    className="
                      text-sm
                      font-bold

                      text-slate-800
                    "
                  >
                    Have a comment or suggestion?
                  </label>
                </div>

                <p
                  className="
                    text-sm
                    leading-6

                    text-slate-500

                    mb-3
                  "
                >
                  Write your feedback below. You will be
                  redirected to our Google Feedback Form to
                  complete your submission.
                </p>

                <textarea
                  id="work-progress-comment"
                  value={comment}
                  onChange={(e) =>
                    setComment(e.target.value)
                  }
                  placeholder="Share your comments, suggestions, or issues you encountered..."
                  rows={4}
                  className="
                    w-full

                    resize-none

                    rounded-2xl

                    border
                    border-slate-200

                    bg-slate-50

                    px-4
                    py-3.5

                    text-sm

                    text-slate-800

                    placeholder:text-slate-400

                    outline-none

                    transition

                    focus:border-[#245844]
                    focus:bg-white
                    focus:ring-4
                    focus:ring-[#245844]/10
                  "
                />
              </div>


              {/* Buttons */}
              <div
                className="
                  flex
                  flex-col-reverse
                  sm:flex-row

                  sm:items-center
                  sm:justify-between

                  gap-3
                "
              >

                {/* Continue to website */}
                <button
                  type="button"
                  onClick={() => setShowNotice(false)}
                  className="
                    inline-flex
                    items-center
                    justify-center

                    min-h-[46px]

                    px-5
                    py-3

                    rounded-xl

                    border
                    border-slate-200

                    bg-white

                    text-sm
                    font-bold

                    text-slate-600

                    transition

                    hover:bg-slate-50
                    hover:text-slate-900
                  "
                >
                  Continue to Website
                </button>


                {/* Google Form */}
                <button
                  type="button"
                  onClick={handleLeaveComment}
                  className="
                    inline-flex
                    items-center
                    justify-center

                    gap-2

                    min-h-[46px]

                    px-5
                    py-3

                    rounded-xl

                    bg-[#173F32]

                    text-sm
                    font-bold

                    text-white

                    shadow-lg
                    shadow-[#173F32]/20

                    transition

                    hover:bg-[#245844]
                    hover:-translate-y-0.5
                  "
                >
                  Leave a Comment

                  <ExternalLink className="w-4 h-4" />
                </button>

              </div>


              <p
                className="
                  mt-5

                  text-center

                  text-xs
                  leading-5

                  text-slate-400
                "
              >
                You may continue using the system without
                submitting feedback.
              </p>

            </div>

          </div>
        </div>
      )}


      {/* Modal animation */}
      <style>
        {`
          @keyframes modalAppear {
            from {
              opacity: 0;
              transform: translateY(12px) scale(0.98);
            }

            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>

    </div>
  );
}

export default Home;