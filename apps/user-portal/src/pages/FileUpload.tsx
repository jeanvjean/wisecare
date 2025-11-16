import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'

function FileUpload() {
  const { user } = useAuthStore()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    setMessage(null)
  }

  const handleUpload = async () => {
    if (!file || !user) return

    setUploading(true)
    setMessage(null)

    try {
      // Upload to Supabase Storage bucket 'uploads' under user-specific folder
      const filePath = `user-${user.id}/${Date.now()}-${file.name}`
      const { data, error } = await supabase.storage
        .from('uploads') // Ensure this bucket exists and is configured
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) throw error

      // Get public URL since bucket is public
      const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(data.path)

      setMessage(`File uploaded successfully! Public URL: ${urlData.publicUrl}`)
      setFile(null)
      // Reset input
      const input = document.getElementById('file-input') as HTMLInputElement
      if (input) input.value = ''
    } catch (error: any) {
      setMessage(`Upload failed: ${error.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">File Upload</h1>
          <p className="text-gray-600 mb-6">Select a file to upload to your storage.</p>

          {message && (
            <div className={`mb-4 p-4 rounded-md ${message.includes('successfully') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="file-input" className="block text-sm font-medium text-gray-700">
                Choose File
              </label>
              <input
                id="file-input"
                type="file"
                onChange={handleFileChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={uploading}
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>

          <div className="mt-6">
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="text-blue-600 hover:text-blue-800"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FileUpload