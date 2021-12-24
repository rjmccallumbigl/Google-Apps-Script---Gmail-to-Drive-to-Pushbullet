/****************************************************************************************************************************************
*
* I have an IP camera configured to email me every time it captures movement. This script saves the attached images to a Google Drive folder. Then it labels them so they are not reparsed when the script runs again.
*
* Folder: https://drive.google.com/drive/u/0/folders/FOLDERID
*
* Activate the Drive API before using.
*
* Sources
* https://ithoughthecamewithyou.com/post/get-an-email-when-your-security-camera-sees-something-new-apps-script--cloud-vision
* https://ithoughthecamewithyou.com/post/capture-dropcam-frames-to-google-drive
* https://www.labnol.org/code/20617-download-gmail-attachments-to-google-drive
*
****************************************************************************************************************************************/
function saveGmailAttachmentstoGoogleDrive() {

  // Declare variables
  var folderID = "Enter Folder ID here";
  var searchQuery = "label:notifications-camera has:attachment";
  var visionString = "visionAPI";
  var threadID = "";
  var messages = []
  var labels = [];
  var attachments = [];
  var driveFile = {};

  // Get Gmail threads
  var threads = GmailApp.search(searchQuery);
  if (threads.length == 0) {
    console.log("No threads to parse");
  } else {
    console.log("Threads: " + threads.length);

    // Get messages from unprocessed threads
    for (var thread in threads) {
      labels = threads[thread].getLabels();
      threadID = threads[thread].getId();

      if (labels.every(function (name) {
        return name.getName() != visionString
      })) {
        messages = threads[thread].getMessages();
      }

      if (messages.length == 0) {
        console.log("No new pics to upload");
      } else {
        console.log("Messages: " + messages.length);

        // Get attachments
        for (var message in messages) {
          attachments = messages[message].getAttachments({
            includeInlineImages: false,
            includeAttachments: true
          });

          if (attachments.length == 0) {
            console.log("No new attachments to process");
          } else {
            // Add to Google Drive folder
            console.log("Attachments: " + attachments.length);
            for (var attachment in attachments) {
              driveFile = Drive.Files.insert(
                {
                  title: attachments[attachment].getName(),
                  mimeType: attachments[attachment].getContentType(),
                  parents: [{ id: folderID }],
                  description: "Processed by Google Apps Script: https://script.google.com/u/0/home/projects/" + ScriptApp.getScriptId() +
                    "\n\nEmail link: https://mail.google.com/mail/u/0/#inbox/" + threadID,
                },
                attachments[attachment].copyBlob()
              );
              // Send to Pushbullet
              sendPushBulletNotification(driveFile);
            }

            // Add processed label to thread
            threads[thread].addLabel(GmailApp.getUserLabelByName(visionString));
            console.log("Label '" + visionString + "' added to Gmail thread https://mail.google.com/mail/u/0/#inbox/" + threadID);
            console.log("Attachments added to https://drive.google.com/drive/u/0/folders/" + folderID);
          }
        }
      }
    }
  }
}

/****************************************************************************************************************************************
*
* Send PushBullet notification on new camera capture.
*
* Folder: https://drive.google.com/drive/u/0/folders/FOLDERID
*
* Activate the PushBullet API before using.
*
* @param {object} driveFile The uploaded Google Drive file
*
* Sources
* https://docs.pushbullet.com/
* https://stackoverflow.com/questions/39931985/pushbullet-sms-from-google-apps-script-json-format
* https://docs.pushbullet.com/v8/#upload-request
* https://stackoverflow.com/questions/24340340/urlfetchapp-upload-file-multipart-form-data-in-google-apps-script
* https://www.reddit.com/r/PushBullet/comments/2zfimh/sending_a_jpg_file_from_the_command_line_with/
*
****************************************************************************************************************************************/
function sendPushBulletNotification(driveFile) {

  // Declare variables
  var baseURL = "https://api.pushbullet.com/v2/";
  var token = "enter pushbullet api token here";
  var uploadJSON = {};
  var options = {
    muteHttpExceptions: true,
    "headers": {
      "Authorization": "Basic " + Utilities.base64Encode(token + ":")
    },
    "followRedirects": true,
    "validateHttpsCertificates": true,
  };
  
  // Upload pic        
  options.method = "POST";
  options.headers['Content-Type'] = "application/json";
  options.payload = JSON.stringify({
    "file_name": driveFile.title,
    "file_type": driveFile.mimeType
  });
  var picResponse = buildAPIRequest(baseURL + "upload-request", options);
  if (picResponse.getResponseCode() == 200) {
    var picResponseJSON = JSON.parse(picResponse.getContentText());

    // Upload pic response
    uploadJSON =
    {
      'awsaccesskeyid': picResponseJSON.data.awsaccesskeyid,
      'acl': picResponseJSON.data.acl,
      'key': picResponseJSON.data.key,
      'signature': picResponseJSON.data.signature,
      'policy': picResponseJSON.data.policy,
      'content-type': picResponseJSON.data['content-type'],
    };

    var formOptions = createMultipartPostRequest(uploadJSON, driveFile);
    var uploadResponse = buildAPIRequest(picResponseJSON.upload_url, formOptions);

    if (uploadResponse.getResponseCode() == 204) {
      console.log("Success! File: " + picResponseJSON.file_url);

      // Now send PushBullet notification
      options.payload = JSON.stringify({
        "type": "file",
        "file_name": driveFile.title,
        "file_type": driveFile.mimeType,
        "file_url": picResponseJSON.file_url
      });

      var pushResponse = UrlFetchApp.fetch(baseURL + "pushes", options);
      if (pushResponse.getResponseCode() == 200) {
        console.log("Success! Pushed image " + driveFile.title);
      } else {
        console.log("Did not successfully push image to Pushbullet");
      }
    } else {
      console.log("Did not successfully upload image to Pushbullet");
    }
  } else {
    console.log("Did not successfully request Pushbullet image upload");
  }
  
  }

/****************************************************************************************************************************************
 * 
 * Send off API call and log results.
 * 
 * @param {String} url The URL we are contacting.
 * @param {Object} options The API options we built in our first function.
 * @return {Object} Results of the API request.
 *  
 ****************************************************************************************************************************************/

function buildAPIRequest(url, options) {

  // Send API request
  var response = UrlFetchApp.fetch(url, options);

  // Parse response
  if (response.getResponseCode() >= 200 || response.getResponseCode() < 300) {
    return response;

  } else {
    console.log("Failure in call to " + url);
    console.log("Response Code: " + response.getResponseCode());
    console.log("Response Content: " + response.getContentText());
    console.log("Response Headers: " + response.getAllHeaders());
    return "error";
  }
}

/****************************************************************************************************************************************
 * 
 * Build a multipart POST request for an API call using TANAIKECH's method.
 * 
 * @param {String} uploadJSON The parameters required to successfully upload our pic to PushBullet.
 * @param {Object} driveFile The uploaded Google Drive file.
 * @return {Object} The multipart post request
 *  
 * Sources
 * https://gist.github.com/tanaikech/d595d30a592979bbf0c692d1193d260c
 * https://tanaikech.github.io/2020/10/17/request-of-multipart/form-data-with-simple-request-body-using-google-apps-script/
 * https://www.labnol.org/code/20096-upload-files-multipart-post
 * 
 ****************************************************************************************************************************************/

function createMultipartPostRequest(uploadJSON, driveFile) {
  var boundary = "xxxxxxxxxx";
  var data = "";
  for (var i in uploadJSON) {
    data += "--" + boundary + "\r\n";
    data += "Content-Disposition: form-data; name=\"" + i + "\"; \r\n\r\n" + uploadJSON[i] + "\r\n";
  }
  data += "--" + boundary + "\r\n";
  data += "Content-Disposition: form-data; name=\"file\"; filename=\"" + driveFile.title + "\"\r\n";
  data += "Content-Type:" + driveFile.mimeType + "\r\n\r\n";
  var payload = Utilities.newBlob(data).getBytes()
    .concat(DriveApp.getFileById(driveFile.id).getBlob().getBytes())
    .concat(Utilities.newBlob("\r\n--" + boundary + "--").getBytes());
  var formOptions = {
    method: "post",
    contentType: "multipart/form-data; boundary=" + boundary,
    payload: payload,
    muteHttpExceptions: true,
  };
  return formOptions;
}
