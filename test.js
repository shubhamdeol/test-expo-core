import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import {Platform, AsyncStorage} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

class Storage {
  static settings = async newSettings => {
    return new Promise(async (resolve, reject) => {
      try {
        let settings =
          (await AsyncStorage.getItem('settings').then(result =>
            JSON.parse(result),
          )) || {};
        if (newSettings) {
          settings = Object.assign(settings, newSettings);
          await AsyncStorage.setItem('settings', JSON.stringify(settings));
        }
        return resolve(settings);
      } catch (e) {
        console.log('Error in settings', e);
        return resolve({});
      }
    });
  };

  static getDirectoryPermissions = async onDirectoryChange => {
    return new Promise(async (resolve, reject) => {
      try {
        const initial =
          FileSystem.StorageAccessFramework.getUriForDirectoryInRoot();
        onDirectoryChange({isSelecting: true}); //For handle appStateChange and loading
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
            initial,
          );
        this.settings({
          downloadsFolder: permissions.granted
            ? permissions.directoryUri
            : null,
        });
        // Unfortunately, StorageAccessFramework has no way to read a previously specified folder without popping up a selector.
        // Save the address to avoid asking for the download folder every time
        onDirectoryChange({
          downloadsFolder: permissions.granted
            ? permissions.directoryUri
            : null,
          isSelecting: false,
        });
        return resolve(permissions.granted ? permissions.directoryUri : null);
      } catch (e) {
        console.log('Error in getDirectoryPermissions', e);
        onDirectoryChange({downloadsFolder: null});
        return resolve(null);
      }
    });
  };

  static downloadFilesAsync = async (files, onDirectoryChange) => {
    // files = [{url: "url", fileName: "new file name" + "extension", mimeType: is_video ? "video/mp4" : "image/jpg"}]
    // onDirectoryChange = () => {cb_something_like_setState()}
    console.log('yoooo');
    return new Promise(async (resolve, reject) => {
      try {
        const {status} = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          return resolve({status: 'error'});
        }
        let settings = await this.settings();
        // Unfortunately, StorageAccessFramework has no way to read a previously specified folder without popping up a selector.
        // Save the address to avoid asking for the download folder every time
        const androidSDK = Platform.constants.Version;

        console.log(settings);

        if (
          Platform.OS === 'android' &&
          androidSDK >= 30 &&
          !settings.downloadsFolder
        ) {
          //Except for Android 11, using the media library works stably
          settings.downloadsFolder = await this.getDirectoryPermissions(
            onDirectoryChange,
          );
        }
        const results = await Promise.all(
          files.map(async file => {
            try {
              if (file.url.includes('https://')) {
                // Remote file
                const {uri, status, headers, md5} =
                  await FileSystem.downloadAsync(
                    file.url,
                    FileSystem.cacheDirectory + file.name,
                  );
                file.url = uri; //local file(file:///data/~~~/content.jpg)
                // The document says to exclude the extension, but without the extension, the saved file cannot be viewed in the Gallery app.
              }
              if (Platform.OS === 'android' && settings.downloadsFolder) {
                // Creating files using SAF
                // I think this code should be in the documentation as an example
                const fileString = await FileSystem.readAsStringAsync(
                  file.url,
                  {encoding: FileSystem.EncodingType.Base64},
                );
                const newFile =
                  await FileSystem.StorageAccessFramework.createFileAsync(
                    settings.downloadsFolder,
                    file.name,
                    file.mimeType,
                  );
                await FileSystem.writeAsStringAsync(newFile, fileString, {
                  encoding: FileSystem.EncodingType.Base64,
                });
              } else {
                // Creating files using MediaLibrary
                const asset = await MediaLibrary.createAssetAsync(file.url);
              }
              return Promise.resolve({status: 'ok'});
            } catch (e) {
              console.log(e);
              return Promise.resolve({status: 'error'});
            }
          }),
        );
        console.log(results);
        return resolve({
          status: results.every(result => result.status === 'ok')
            ? 'ok'
            : 'error',
        });
      } catch (e) {
        console.log('Error in downloadFilesAsync', e);
        return resolve({status: 'error'});
      }
    });
  };
}

export default Storage;
