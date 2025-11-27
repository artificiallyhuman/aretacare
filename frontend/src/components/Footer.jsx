import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Copyright and GitHub */}
          <div className="text-center sm:text-left">
            <p className="text-sm text-gray-600">
              © 2025 AretaCare. Open Source Project.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <a
                href="https://github.com/artificiallyhuman/aretacare"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 underline"
              >
                GitHub Repository
              </a>
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
            <Link
              to="/terms"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Privacy Policy
            </Link>
            <a
              href="https://github.com/artificiallyhuman/aretacare/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Report Issue
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
